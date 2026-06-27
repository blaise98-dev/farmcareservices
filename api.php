<?php
// =============================================================================
//  MooMe API v3.0 — Enhanced with command queue, milking sessions, RFID lookup
// =============================================================================

define('DB_HOST', 'localhost');
define('DB_NAME', 'MooMeSystem');
define('DB_USER', 'root');
define('DB_PASS', '');

// Thresholds
define('THRESH_TEMP_WARN',  28.0);
define('THRESH_TEMP_FAN',   30.0);
define('THRESH_TEMP_CRIT',  32.0);
define('THRESH_TANK_FULL',  90.0);
define('THRESH_TANK_CRIT',  20.0);
define('THRESH_FEED_EMPTY',  0.5);
define('THRESH_GAS_WARN',   60.0);
define('THRESH_GAS_CRIT',   80.0);
define('MQ135_PPM_MIN',    300.0);
define('MQ135_PPM_MAX',   1200.0);

// Milking estimation: litres per second of session duration
// Adjust based on your herd's average production rate
define('MILK_RATE_LPM', 1.2);  // litres per minute default

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// =============================================================================
//  Database singleton — auto-creates new tables on first connect
// =============================================================================
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES   => false]
        );
        // Auto-create enhanced tables so setup.sql is not required
        $pdo->exec("CREATE TABLE IF NOT EXISTS SensorReadings (
            reading_id    INT AUTO_INCREMENT PRIMARY KEY,
            device_id     VARCHAR(50) NOT NULL DEFAULT 'esp32_main',
            temperature   FLOAT NULL, humidity FLOAT NULL,
            mq5_pct INT NULL, mq135_pct INT NULL,
            flow_rate FLOAT NULL, total_liters FLOAT NULL,
            tank_level FLOAT NULL, feed_weight FLOAT NULL,
            pump_status TINYINT(1) NOT NULL DEFAULT 0,
            fan_status  TINYINT(1) NOT NULL DEFAULT 0,
            spray_status TINYINT(1) NOT NULL DEFAULT 0,
            buzzer_status TINYINT(1) NOT NULL DEFAULT 0,
            recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sr_time (device_id, recorded_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $pdo->exec("CREATE TABLE IF NOT EXISTS DeviceCommands (
            command_id    INT AUTO_INCREMENT PRIMARY KEY,
            device_id     VARCHAR(50) NOT NULL DEFAULT 'esp32_main',
            command_type  ENUM('pump','fan','spray','buzzer') NOT NULL,
            command_value ENUM('ON','OFF','AUTO') NOT NULL,
            is_executed   BOOLEAN NOT NULL DEFAULT FALSE,
            executed_at   DATETIME NULL,
            created_by    VARCHAR(100) NOT NULL DEFAULT 'web_dashboard',
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dc_pending (device_id, is_executed, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $pdo->exec("CREATE TABLE IF NOT EXISTS MilkingSessions (
            session_id       INT AUTO_INCREMENT PRIMARY KEY,
            cow_id           INT NULL,
            rfid_tag         VARCHAR(50) NULL,
            cow_name         VARCHAR(100) NULL,
            device_id        VARCHAR(50) NOT NULL DEFAULT 'trs_node',
            start_time       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            end_time         DATETIME NULL,
            duration_seconds INT NULL,
            milk_liters      FLOAT NOT NULL DEFAULT 0,
            tank_distance_cm FLOAT NULL,
            status ENUM('Active','Complete','Aborted') NOT NULL DEFAULT 'Active',
            INDEX idx_ms_status (status),
            INDEX idx_ms_cow    (cow_id, start_time)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
    return $pdo;
}

function mq135ToPpm(int $pct): float {
    return round(MQ135_PPM_MIN + ($pct / 100.0) * (MQ135_PPM_MAX - MQ135_PPM_MIN), 2);
}

// =============================================================================
//  Alert & control logging helpers
// =============================================================================
function logAlert(string $type, ?int $cow_id, string $severity, string $message): void {
    $dup = db()->prepare(
        "SELECT alert_id FROM Alerts
         WHERE alert_type = ? AND is_resolved = FALSE
           AND created_at > NOW() - INTERVAL 10 MINUTE LIMIT 1"
    );
    $dup->execute([$type]);
    if ($dup->fetch()) return;
    db()->prepare(
        "INSERT INTO Alerts (alert_type, cow_id, severity, message) VALUES (?, ?, ?, ?)"
    )->execute([$type, $cow_id, $severity, $message]);
}

function logControl(string $device_type, string $action, ?float $value, string $reason): void {
    $last = db()->prepare(
        "SELECT action FROM SystemControlLogs
         WHERE device_type = ? ORDER BY recorded_at DESC LIMIT 1"
    );
    $last->execute([$device_type]);
    $prev = $last->fetchColumn();
    if ($prev === false || $prev !== $action) {
        db()->prepare(
            "INSERT INTO SystemControlLogs (device_type, action, value, trigger_reason)
             VALUES (?, ?, ?, ?)"
        )->execute([$device_type, $action, $value, $reason]);
    }
}

// =============================================================================
//  POST — sensor data from ESP32
// =============================================================================
function handleSensorData(array $data): array {
    $d = [
        'device_id'    => (string) ($data['device_id']    ?? 'esp32_main'),
        'temperature'  => (float)  ($data['temperature']  ?? 0.0),
        'humidity'     => (float)  ($data['humidity']     ?? 0.0),
        'mq5_pct'      => (int)    ($data['mq5_pct']      ?? 0),
        'mq135_pct'    => (int)    ($data['mq135_pct']    ?? 0),
        'flow_rate'    => (float)  ($data['flow_rate']    ?? 0.0),
        'total_liters' => (float)  ($data['total_liters'] ?? 0.0),
        'tank_level'   => (float)  ($data['tank_level']   ?? 0.0),
        'feed_weight'  => (float)  ($data['feed_weight']  ?? 0.0),
        'pump_status'  => (int)    ($data['pump_status']  ?? 0),
        'fan_status'   => (int)    ($data['fan_status']   ?? 0),
        'spray_status' => (int)    ($data['spray_status'] ?? 0),
        'buzzer_status'=> (int)    ($data['buzzer_status']?? 0),
    ];

    $air_ppm = mq135ToPpm($d['mq135_pct']);
    $alert_triggered = (
        $d['temperature'] >= THRESH_TEMP_WARN ||
        $d['mq135_pct']   >= THRESH_GAS_WARN  ||
        $d['mq5_pct']     >= THRESH_GAS_WARN
    );

    // ── EnvironmentalReadings (existing table) ────────────────────────────────
    $env = db()->prepare(
        "INSERT INTO EnvironmentalReadings
         (temperature_celsius, humidity_percent, air_quality_ppm, oxygen_percent, alert_triggered)
         VALUES (?, ?, ?, NULL, ?)"
    );
    $env->execute([$d['temperature'], $d['humidity'], $air_ppm, $alert_triggered ? 1 : 0]);
    $env_id = (int) db()->lastInsertId();

    // ── SensorReadings (new full snapshot) ───────────────────────────────────
    db()->prepare(
        "INSERT INTO SensorReadings
         (device_id, temperature, humidity, mq5_pct, mq135_pct,
          flow_rate, total_liters, tank_level, feed_weight,
          pump_status, fan_status, spray_status, buzzer_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    )->execute([
        $d['device_id'], $d['temperature'], $d['humidity'],
        $d['mq5_pct'], $d['mq135_pct'],
        $d['flow_rate'], $d['total_liters'], $d['tank_level'], $d['feed_weight'],
        $d['pump_status'], $d['fan_status'], $d['spray_status'], $d['buzzer_status'],
    ]);

    // ── Actuator + alert logging ──────────────────────────────────────────────
    $temp  = $d['temperature'];
    $tank  = $d['tank_level'];

    logControl('Fan', $d['fan_status'] ? 'ON' : 'OFF', null,
        $d['fan_status'] ? "Temp {$temp}°C ≥ " . THRESH_TEMP_FAN . "°C" : "Temp normalized to {$temp}°C");
    logControl('SprayNozzle', $d['spray_status'] ? 'ON' : 'OFF', null,
        $d['spray_status'] ? "Cooling spray ON — {$temp}°C" : "Spray OFF");
    logControl('WaterPump', $d['pump_status'] ? 'ON' : 'OFF', $tank,
        $d['pump_status'] ? "Tank at {$tank}% — pumping" : "Tank at {$tank}% — pump stopped");

    if ($temp >= THRESH_TEMP_CRIT)
        logAlert('Temperature', null, 'Critical', "CRITICAL: Barn temp {$temp}°C — cooling active");
    elseif ($temp >= THRESH_TEMP_WARN)
        logAlert('Temperature', null, 'Warning', "Barn temp elevated: {$temp}°C");

    $ppm = mq135ToPpm($d['mq135_pct']);
    if ($d['mq135_pct'] >= THRESH_GAS_CRIT)
        logAlert('Air Quality', null, 'Critical', "CRITICAL: Air quality {$d['mq135_pct']}% (~{$ppm} PPM)");
    elseif ($d['mq135_pct'] >= THRESH_GAS_WARN)
        logAlert('Air Quality', null, 'Warning', "Air quality degraded: {$d['mq135_pct']}% (~{$ppm} PPM)");

    if ($d['mq5_pct'] >= THRESH_GAS_CRIT)
        logAlert('Air Quality', null, 'Critical', "CRITICAL: MQ5 {$d['mq5_pct']}% — possible gas leak");
    elseif ($d['mq5_pct'] >= THRESH_GAS_WARN)
        logAlert('Air Quality', null, 'Warning', "MQ5 elevated: {$d['mq5_pct']}%");

    if ($tank >= THRESH_TANK_FULL)
        logAlert('Water', null, 'Info', "Tank full at {$tank}% — pump stopped");
    elseif ($tank > 0 && $tank <= THRESH_TANK_CRIT)
        logAlert('Water', null, 'Warning', "Tank critically low: {$tank}%");

    if ($d['feed_weight'] >= 0 && $d['feed_weight'] < THRESH_FEED_EMPTY)
        logAlert('Feed', null, 'Warning', "Feed hopper empty: {$d['feed_weight']} kg");

    return [
        'status'          => 'success',
        'env_reading_id'  => $env_id,
        'air_quality_ppm' => $air_ppm,
        'alert_triggered' => $alert_triggered,
        'timestamp'       => date('Y-m-d H:i:s'),
    ];
}

// =============================================================================
//  POST — store command from web dashboard
// =============================================================================
function handleCommand(array $data): array {
    $type  = $data['command_type']  ?? null;
    $value = $data['command_value'] ?? null;
    $dev   = $data['device_id']     ?? 'esp32_main';

    $valid_types  = ['pump', 'fan', 'spray', 'buzzer'];
    $valid_values = ['ON', 'OFF', 'AUTO'];

    if (!in_array($type,  $valid_types)  ||
        !in_array($value, $valid_values)) {
        http_response_code(400);
        return ['status' => 'error', 'message' => 'Invalid command_type or command_value'];
    }

    // Cancel any pending un-executed commands for same device+type
    db()->prepare(
        "UPDATE DeviceCommands SET is_executed=TRUE, executed_at=NOW()
         WHERE device_id=? AND command_type=? AND is_executed=FALSE"
    )->execute([$dev, $type]);

    $stmt = db()->prepare(
        "INSERT INTO DeviceCommands (device_id, command_type, command_value, created_by)
         VALUES (?, ?, ?, 'web_dashboard')"
    );
    $stmt->execute([$dev, $type, $value]);

    logControl(ucfirst($type), $value, null, "Manual override via web dashboard");

    return ['status' => 'success', 'command_id' => (int)db()->lastInsertId(),
            'message' => "Command queued: {$type} → {$value}"];
}

// =============================================================================
//  POST — RFID scan from TRS node
// =============================================================================
function handleRfidScan(array $data): array {
    $tag = trim($data['rfid_tag'] ?? '');
    if (!$tag) {
        http_response_code(400);
        return ['status' => 'error', 'message' => 'Missing rfid_tag'];
    }

    $stmt = db()->prepare(
        "SELECT cow_id, cow_name, breed, health_status, lactating FROM Cows
         WHERE rfid_tag = ? AND is_active = TRUE LIMIT 1"
    );
    $stmt->execute([$tag]);
    $cow = $stmt->fetch();

    if (!$cow) {
        return ['status' => 'success', 'found' => false,
                'cow_name' => 'Unknown', 'message' => "RFID {$tag} not registered"];
    }

    return ['status' => 'success', 'found' => true,
            'cow_id'       => $cow['cow_id'],
            'cow_name'     => $cow['cow_name'],
            'breed'        => $cow['breed'],
            'health_status'=> $cow['health_status'],
            'lactating'    => $cow['lactating'],
            'rfid_tag'     => $tag];
}

// =============================================================================
//  POST — start milking session
// =============================================================================
function handleMilkingStart(array $data): array {
    $tag    = trim($data['rfid_tag']  ?? '');
    $dev    = $data['device_id']      ?? 'trs_node';
    if (!$tag) {
        http_response_code(400);
        return ['status' => 'error', 'message' => 'Missing rfid_tag'];
    }

    // Lookup cow
    $s = db()->prepare("SELECT cow_id, cow_name FROM Cows WHERE rfid_tag=? AND is_active=TRUE LIMIT 1");
    $s->execute([$tag]);
    $cow = $s->fetch();

    // Abort any lingering active session for this device
    db()->prepare(
        "UPDATE MilkingSessions SET status='Aborted', end_time=NOW()
         WHERE device_id=? AND status='Active'"
    )->execute([$dev]);

    $stmt = db()->prepare(
        "INSERT INTO MilkingSessions (cow_id, rfid_tag, cow_name, device_id)
         VALUES (?, ?, ?, ?)"
    );
    $stmt->execute([
        $cow ? $cow['cow_id']  : null,
        $tag,
        $cow ? $cow['cow_name'] : 'Unknown',
        $dev,
    ]);

    return ['status' => 'success',
            'session_id' => (int)db()->lastInsertId(),
            'cow_name'   => $cow ? $cow['cow_name'] : 'Unknown'];
}

// =============================================================================
//  POST — end milking session
// =============================================================================
function handleMilkingEnd(array $data): array {
    $tag      = trim($data['rfid_tag']        ?? '');
    $dev      = $data['device_id']            ?? 'trs_node';
    $sessId   = (int)($data['session_id']     ?? 0);
    $durSec   = (int)($data['duration_seconds'] ?? 0);
    $distCm   = (float)($data['tank_distance_cm'] ?? 0);

    // Estimate milk: rate (L/min) × duration in minutes
    $milkL = round((MILK_RATE_LPM / 60.0) * $durSec, 2);

    // Find session
    $where = $sessId ? "session_id=?" : "device_id=? AND status='Active'";
    $param = $sessId ? [$sessId] : [$dev];

    $s = db()->prepare("SELECT session_id, cow_id FROM MilkingSessions WHERE {$where} LIMIT 1");
    $s->execute($param);
    $sess = $s->fetch();

    if (!$sess) {
        return ['status' => 'error', 'message' => 'No active session found'];
    }

    db()->prepare(
        "UPDATE MilkingSessions
         SET status='Complete', end_time=NOW(),
             duration_seconds=?, milk_liters=?, tank_distance_cm=?
         WHERE session_id=?"
    )->execute([$durSec, $milkL, $distCm > 0 ? $distCm : null, $sess['session_id']]);

    // Log to MilkProductionRecords if cow known
    if ($sess['cow_id'] && $milkL > 0) {
        db()->prepare(
            "INSERT INTO MilkProductionRecords (cow_id, milk_amount_liters) VALUES (?, ?)"
        )->execute([$sess['cow_id'], $milkL]);
        db()->prepare(
            "UPDATE Cows SET last_milk_date=CURDATE() WHERE cow_id=?"
        )->execute([$sess['cow_id']]);
    }

    return ['status'      => 'success',
            'session_id'  => $sess['session_id'],
            'milk_liters' => $milkL,
            'duration_s'  => $durSec];
}

// =============================================================================
//  GET — all actions
// =============================================================================
function handleGet(): array {
    $action = $_GET['action'] ?? 'env_latest';
    $limit  = min((int)($_GET['limit'] ?? 20), 200);

    switch ($action) {

        // ── Sensor / environmental ─────────────────────────────────────────────
        case 'env_latest':
            $s = db()->prepare("SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT ?");
            $s->execute([$limit]);
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'sensor_latest':
            // Try full snapshot table first (populated by new firmware)
            try {
                $s = db()->query("SELECT * FROM SensorReadings ORDER BY recorded_at DESC LIMIT 1");
                $row = $s->fetch();
                if ($row) return ['status' => 'success', 'data' => $row];
            } catch (PDOException $ignored) { /* table not ready — fall through */ }

            // Fallback: normalise EnvironmentalReadings so the dashboard cards still work
            $s = db()->query("SELECT * FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT 1");
            $env = $s->fetch();
            if (!$env) return ['status' => 'success', 'data' => null];
            // Reverse-calculate mq135_pct from stored PPM value
            $mq135_pct = (int) max(0, min(100, round(($env['air_quality_ppm'] - MQ135_PPM_MIN)
                                                       / (MQ135_PPM_MAX - MQ135_PPM_MIN) * 100)));
            return ['status' => 'success', 'data' => [
                'device_id'    => 'esp32_main',
                'temperature'  => $env['temperature_celsius'],
                'humidity'     => $env['humidity_percent'],
                'mq5_pct'      => 0,
                'mq135_pct'    => $mq135_pct,
                'flow_rate'    => 0,
                'total_liters' => 0,
                'tank_level'   => 0,
                'feed_weight'  => 0,
                'pump_status'  => 0,
                'fan_status'   => 0,
                'spray_status' => 0,
                'buzzer_status'=> 0,
                'recorded_at'  => $env['recorded_at'],
                '_source'      => 'env_fallback',
            ]];

        case 'sensor_chart':
            // Try SensorReadings first
            try {
                $s = db()->prepare(
                    "SELECT recorded_at, temperature, humidity, tank_level, flow_rate
                     FROM SensorReadings ORDER BY recorded_at DESC LIMIT ?"
                );
                $s->execute([$limit]);
                $rows = $s->fetchAll();
                if ($rows) return ['status' => 'success', 'data' => array_reverse($rows)];
            } catch (PDOException $ignored) { /* fall through */ }

            // Fallback: map EnvironmentalReadings fields to the same names
            $s = db()->prepare(
                "SELECT recorded_at,
                        temperature_celsius AS temperature,
                        humidity_percent    AS humidity,
                        0                  AS tank_level,
                        0                  AS flow_rate
                 FROM EnvironmentalReadings ORDER BY recorded_at DESC LIMIT ?"
            );
            $s->execute([$limit]);
            return ['status' => 'success', 'data' => array_reverse($s->fetchAll())];

        case 'env_today':
            $s = db()->query(
                "SELECT ROUND(AVG(temperature_celsius),2) AS avg_temp,
                        ROUND(MAX(temperature_celsius),2) AS max_temp,
                        ROUND(MIN(temperature_celsius),2) AS min_temp,
                        ROUND(AVG(humidity_percent),2)    AS avg_humidity,
                        ROUND(AVG(air_quality_ppm),2)     AS avg_air_ppm,
                        SUM(alert_triggered)               AS alerts_triggered,
                        COUNT(*)                           AS total_readings
                 FROM EnvironmentalReadings WHERE DATE(recorded_at)=CURDATE()"
            );
            return ['status' => 'success', 'data' => $s->fetch()];

        case 'env_chart':
            $s = db()->query(
                "SELECT recorded_at AS ts, temperature_celsius, humidity_percent, air_quality_ppm
                 FROM EnvironmentalReadings WHERE DATE(recorded_at)=CURDATE()
                 ORDER BY recorded_at ASC LIMIT 200"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'env_7days':
            $s = db()->query(
                "SELECT DATE(recorded_at) AS reading_date,
                        ROUND(AVG(temperature_celsius),2) AS avg_temp,
                        ROUND(MAX(temperature_celsius),2) AS max_temp,
                        ROUND(AVG(humidity_percent),2)    AS avg_humidity,
                        ROUND(AVG(air_quality_ppm),2)     AS avg_air_ppm,
                        COUNT(*) AS readings_count
                 FROM EnvironmentalReadings
                 WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                 GROUP BY DATE(recorded_at) ORDER BY reading_date DESC"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        // ── Alerts ─────────────────────────────────────────────────────────────
        case 'alerts_active':
            $s = db()->query("SELECT * FROM ActiveAlerts LIMIT 50");
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'alerts_all':
            $s = db()->prepare(
                "SELECT a.*, c.cow_name FROM Alerts a
                 LEFT JOIN Cows c ON a.cow_id=c.cow_id
                 ORDER BY a.created_at DESC LIMIT ?"
            );
            $s->execute([$limit]);
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'resolve_alert':
            if (!isset($_GET['id'])) return ['status' => 'error', 'message' => 'Missing id'];
            db()->prepare(
                "UPDATE Alerts SET is_resolved=TRUE, resolved_at=NOW() WHERE alert_id=?"
            )->execute([(int)$_GET['id']]);
            return ['status' => 'success'];

        // ── Control logs ───────────────────────────────────────────────────────
        case 'control_logs':
            $s = db()->prepare("SELECT * FROM SystemControlLogs ORDER BY recorded_at DESC LIMIT ?");
            $s->execute([$limit]);
            return ['status' => 'success', 'data' => $s->fetchAll()];

        // ── Commands ───────────────────────────────────────────────────────────
        case 'get_commands':
            $dev = $_GET['device_id'] ?? 'esp32_main';
            try {
                $s = db()->prepare(
                    "SELECT command_id, command_type, command_value
                     FROM DeviceCommands
                     WHERE device_id=? AND is_executed=FALSE
                     ORDER BY created_at ASC LIMIT 10"
                );
                $s->execute([$dev]);
                $cmds = $s->fetchAll();
            } catch (PDOException $ignored) { $cmds = []; }
            try {
                $ms = db()->query("SELECT cow_name FROM MilkingSessions WHERE status='Active' LIMIT 1");
                $milking = $ms->fetch();
            } catch (PDOException $ignored) { $milking = false; }
            return [
                'status'         => 'success',
                'data'           => $cmds,
                'milking_active' => (bool)$milking,
                'milking_cow'    => $milking ? $milking['cow_name'] : '',
            ];

        case 'cmd_executed':
            if (!isset($_GET['id'])) return ['status' => 'error', 'message' => 'Missing id'];
            db()->prepare(
                "UPDATE DeviceCommands SET is_executed=TRUE, executed_at=NOW() WHERE command_id=?"
            )->execute([(int)$_GET['id']]);
            return ['status' => 'success'];

        // ── Cows ───────────────────────────────────────────────────────────────
        case 'cows_all':
            $s = db()->query(
                "SELECT cow_id, rfid_tag, cow_name, breed, birth_date,
                        TIMESTAMPDIFF(MONTH, birth_date, CURDATE()) AS age_months,
                        weight_kg, health_status, lactating, last_milk_date
                 FROM Cows WHERE is_active=TRUE ORDER BY cow_id"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'cows_health':
            $s = db()->query(
                "SELECT c.cow_id, c.cow_name, c.rfid_tag, c.breed,
                        c.health_status, c.lactating, c.weight_kg,
                        t.body_temp_celsius, t.status AS temp_status,
                        (SELECT milk_amount_liters FROM MilkProductionRecords
                         WHERE cow_id=c.cow_id ORDER BY recorded_at DESC LIMIT 1) AS last_milk_liters
                 FROM Cows c
                 LEFT JOIN TemperatureReadings t ON c.cow_id=t.cow_id
                   AND t.recorded_at=(SELECT MAX(recorded_at) FROM TemperatureReadings WHERE cow_id=c.cow_id)
                 WHERE c.is_active=TRUE
                 ORDER BY FIELD(c.health_status,'Critical','Warning','Under Treatment','Healthy')"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        // ── Milking ────────────────────────────────────────────────────────────
        case 'milking_latest':
            try {
                $s = db()->prepare(
                    "SELECT session_id, rfid_tag, cow_name, device_id,
                            start_time, end_time, duration_seconds,
                            milk_liters, status
                     FROM MilkingSessions ORDER BY start_time DESC LIMIT ?"
                );
                $s->execute([$limit]);
                return ['status' => 'success', 'data' => $s->fetchAll()];
            } catch (PDOException $ignored) {
                return ['status' => 'success', 'data' => []];
            }

        case 'milking_active':
            try {
                $s = db()->query(
                    "SELECT session_id, cow_name, rfid_tag, start_time,
                            TIMESTAMPDIFF(SECOND, start_time, NOW()) AS elapsed_seconds
                     FROM MilkingSessions WHERE status='Active' LIMIT 1"
                );
                return ['status' => 'success', 'data' => $s->fetch() ?: null];
            } catch (PDOException $ignored) {
                return ['status' => 'success', 'data' => null];
            }

        case 'milk_today':
            $s = db()->query("SELECT * FROM DailyMilkSummary WHERE milk_date=CURDATE()");
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'milk_top5':
            $s = db()->query(
                "SELECT c.cow_id, c.cow_name,
                        SUM(m.milk_amount_liters) AS total_weekly_liters,
                        ROUND(AVG(m.milk_amount_liters),2) AS avg_session_liters
                 FROM Cows c JOIN MilkProductionRecords m ON c.cow_id=m.cow_id
                 WHERE m.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                 GROUP BY c.cow_id, c.cow_name
                 ORDER BY total_weekly_liters DESC LIMIT 5"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        // ── Farm summary ───────────────────────────────────────────────────────
        case 'farm_summary':
            $s = db()->query("SELECT * FROM SystemHealthSummary");
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'components_cost':
            $s = db()->query(
                "SELECT category, COUNT(*) AS component_count,
                        SUM(quantity) AS total_units,
                        SUM(total_cost_rwf) AS total_cost_rwf
                 FROM Components GROUP BY category WITH ROLLUP"
            );
            return ['status' => 'success', 'data' => $s->fetchAll()];

        case 'sms_logs':
            $s = db()->prepare("SELECT * FROM SmsLogs ORDER BY created_at DESC LIMIT ?");
            $s->execute([$limit]);
            return ['status' => 'success', 'data' => $s->fetchAll()];

        default:
            return ['status' => 'error', 'message' => "Unknown action: {$action}"];
    }
}

// =============================================================================
//  POST router
// =============================================================================
function handlePost(): array {
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!$data) {
        http_response_code(400);
        return ['status' => 'error', 'message' => 'Invalid JSON payload'];
    }

    $action = $data['action'] ?? null;

    if ($action === 'command')       return handleCommand($data);
    if ($action === 'rfid_scan')     return handleRfidScan($data);
    if ($action === 'milking_start') return handleMilkingStart($data);
    if ($action === 'milking_end')   return handleMilkingEnd($data);

    if (!isset($data['device_id'])) {
        http_response_code(400);
        return ['status' => 'error', 'message' => 'Missing device_id or action'];
    }

    return handleSensorData($data);
}

// =============================================================================
//  Entry point
// =============================================================================
try {
    $result = match($_SERVER['REQUEST_METHOD']) {
        'POST'  => handlePost(),
        'GET'   => handleGet(),
        default => (function() {
            http_response_code(405);
            return ['status' => 'error', 'message' => 'Method not allowed'];
        })()
    };
} catch (PDOException $e) {
    http_response_code(500);
    $result = ['status' => 'error', 'message' => 'DB: ' . $e->getMessage()];
} catch (Throwable $e) {
    http_response_code(500);
    $result = ['status' => 'error', 'message' => $e->getMessage()];
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_NUMERIC_CHECK);
