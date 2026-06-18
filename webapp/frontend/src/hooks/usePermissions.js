/**
 * usePermissions — role-based access helpers for MooMe frontend.
 *
 * Permission matrix mirrors the backend rbac.py table exactly.
 * Import `usePermissions` in any component to gate UI elements.
 */
import { useAuth } from '../context/AuthContext';

const ADMIN = 'Admin';
const FARMER = 'Farmer';
const VET = 'Veterinarian';
const TECH = 'Technician';

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  const is = (r) => role === r;
  const any = (...roles) => roles.includes(role);

  return {
    role,

    // ── Nav / page access ──────────────────────────────────────
    canViewDashboard:     any(ADMIN, FARMER, VET, TECH),
    canViewMyCows:        is(FARMER),                   // only Farmer sees "My Cows" registration view
    canViewHerd:          any(ADMIN, FARMER, VET, TECH),// read herd list (all roles)
    canRegisterCow:       is(FARMER),                   // only Farmer registers cows
    canViewMilk:          any(ADMIN, FARMER, VET, TECH),
    canViewFeed:          any(ADMIN, FARMER, VET, TECH),
    canViewEnvironment:   any(ADMIN, FARMER, VET, TECH),
    canViewAlerts:        any(ADMIN, FARMER, VET, TECH),
    canViewEconomics:     any(ADMIN, FARMER, TECH),     // NOT Veterinarian
    canViewPredictions:   any(ADMIN, VET),              // NOT Farmer, NOT Technician
    canViewSettings:      any(ADMIN, FARMER, VET, TECH),
    canViewAdminPanel:    is(ADMIN),
    canManageUsers:       is(ADMIN),
    canViewReports:       is(ADMIN),

    // ── Herd actions ──────────────────────────────────────────
    canEditCow:             any(FARMER, ADMIN, VET),    // Farmer edits profile; Vet edits health; Admin retires
    canUpdateHealthStatus:  any(ADMIN, VET),
    canUpdateWeight:        any(FARMER, ADMIN, VET),
    canUpdateLactation:     any(FARMER, ADMIN, VET),
    canRetireCow:           is(ADMIN),

    // ── Health / treatment / vaccination write ────────────────
    canWriteHealth:         is(VET),
    canNotifyVet:           any(FARMER, TECH),          // Farmer/Tech can send symptom alerts to vet

    // ── Milk actions ──────────────────────────────────────────
    canLogMilk:             any(ADMIN, FARMER),

    // ── Feed actions ──────────────────────────────────────────
    canLogFeed:             any(ADMIN, FARMER, VET),    // vet can prescribe nutrition

    // ── Environment actions ───────────────────────────────────
    canAddEnvReading:       any(ADMIN, TECH),

    // ── Alert actions ─────────────────────────────────────────
    canResolveAlert:        any(ADMIN, FARMER, VET, TECH),
    canCreateAlert:         any(ADMIN, FARMER, VET, TECH),
    canCreateHealthAlert:   any(ADMIN, VET),

    // ── Predictions ───────────────────────────────────────────
    canViewHealthRisks:     any(ADMIN, VET),

    // ── Economics ─────────────────────────────────────────────
    canViewEconomicsDetail: any(ADMIN, FARMER, TECH),

    // ── Role shortcuts ────────────────────────────────────────
    isAdmin:                is(ADMIN),
    isFarmer:               is(FARMER),
    isVet:                  is(VET),
    isTechnician:           is(TECH),
  };
}
