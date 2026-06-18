import asyncio
from playwright.async_api import async_playwright

async def main():
    html_path = "/Users/blaiseai4sense/Desktop/ClaudeRemyProj/IOT_AI_PRESENTATION.html"
    pdf_path = "/Users/blaiseai4sense/Desktop/ClaudeRemyProj/IOT_AI_PRESENTATION.pdf"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            headless=True
        )
        page = await browser.new_page(viewport={"width": 1400, "height": 900})
        await page.goto(f"file://{html_path}", wait_until="networkidle")
        await page.wait_for_timeout(3000)

        # Force all reveal elements visible and fix all print issues
        await page.evaluate("""
            // Make all reveal elements visible
            document.querySelectorAll('.reveal').forEach(el => {
                el.classList.add('visible');
                el.style.opacity = '1';
                el.style.transform = 'none';
                el.style.transition = 'none';
            });

            // Force all children visible too
            document.querySelectorAll('.env-card, .obj-card, .cap-item, .ndc-card, .scale-step, .arch-img-card, .quarter-card').forEach(el => {
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.transform = 'none';
            });

            // Fix tables - ensure they render
            document.querySelectorAll('table').forEach(t => {
                t.style.visibility = 'visible';
                t.style.opacity = '1';
                t.style.display = 'table';
            });
            document.querySelectorAll('thead, tbody, tfoot, tr, th, td').forEach(el => {
                el.style.visibility = 'visible';
                el.style.opacity = '1';
            });

            // Fix overflow containers
            document.querySelectorAll('[style*="overflow"]').forEach(el => {
                el.style.overflow = 'visible';
            });
            document.querySelectorAll('div').forEach(el => {
                if (getComputedStyle(el).overflow === 'hidden' || getComputedStyle(el).overflow === 'auto') {
                    el.style.overflow = 'visible';
                }
                if (getComputedStyle(el).overflowX === 'auto' || getComputedStyle(el).overflowX === 'hidden') {
                    el.style.overflowX = 'visible';
                }
            });

            // Ensure env-grid and ndc-grid children are visible
            document.querySelectorAll('.env-grid, .ndc-grid, .env-highlight').forEach(el => {
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.display = 'grid';
            });
        """)

        # Heavy CSS overrides for print
        await page.add_style_tag(content="""
            /* Force color printing */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }

            /* Remove noise overlay */
            body::before { display: none !important; }

            /* Nav: static for print */
            nav { position: relative !important; }

            /* Kill min-heights and excessive padding */
            .hero { min-height: auto !important; padding: 1.5rem 2.5rem !important; }
            section { padding: 1.5rem 2.5rem !important; page-break-inside: avoid; }

            /* Force all hidden/animated elements visible */
            .reveal, .reveal * {
                opacity: 1 !important;
                visibility: visible !important;
                transform: none !important;
                transition: none !important;
            }

            /* ===== ENV SECTION (dark bg) ===== */
            .env-mission {
                background: #0a1f0a !important;
                color: white !important;
                position: relative !important;
            }
            .env-mission::before { display: none !important; }
            .env-grid {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 1rem !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            .env-card {
                background: rgba(255,255,255,0.08) !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                opacity: 1 !important;
                visibility: visible !important;
                display: block !important;
                padding: 1.2rem !important;
                border-radius: 12px !important;
            }
            .env-card h3 { color: white !important; }
            .env-card p { color: rgba(255,255,255,0.7) !important; }
            .env-card-icon { display: flex !important; }
            .gas-tag { display: inline-block !important; }

            .env-highlight {
                grid-column: 1 / -1 !important;
                display: grid !important;
                grid-template-columns: 1fr 1fr 1fr !important;
                background: rgba(46,125,50,0.15) !important;
                border: 1px solid rgba(46,125,50,0.3) !important;
                opacity: 1 !important;
                visibility: visible !important;
                padding: 1.5rem !important;
            }
            .env-highlight-item { opacity: 1 !important; visibility: visible !important; }
            .env-highlight-item .value { color: #ffca28 !important; }
            .env-highlight-item .desc { color: rgba(255,255,255,0.6) !important; }

            /* ===== OBJECTIVES ===== */
            .objectives-grid {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 1rem !important;
            }

            /* ===== CAPABILITIES ===== */
            .cap-grid {
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 1rem !important;
            }

            /* ===== ARCHITECTURE ===== */
            .arch-images {
                display: grid !important;
                grid-template-columns: 1fr 1fr !important;
                gap: 1.5rem !important;
            }
            .arch-img-card {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            .arch-img-card img {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                height: auto !important;
            }
            .arch-diagram {
                overflow: visible !important;
                display: block !important;
            }
            .arch-diagram::before { display: none !important; }
            .arch-svg { display: block !important; }

            /* ===== LOGFRAME TABLE ===== */
            .logframe-table {
                display: table !important;
                width: 100% !important;
                visibility: visible !important;
                opacity: 1 !important;
                font-size: 0.6rem !important;
                border-collapse: collapse !important;
            }
            .logframe-table thead { display: table-header-group !important; }
            .logframe-table tbody { display: table-row-group !important; }
            .logframe-table tr { display: table-row !important; }
            .logframe-table th, .logframe-table td {
                display: table-cell !important;
                visibility: visible !important;
                opacity: 1 !important;
                padding: 0.3rem 0.25rem !important;
            }
            .logframe-table thead th {
                background: #2d5016 !important;
                color: white !important;
            }
            .logframe-table thead th.year-header {
                background: #1a1a0e !important;
            }
            .logframe-table .money { font-size: 0.58rem !important; }
            .logframe-table .year-total { background: rgba(45,80,22,0.06) !important; color: #2d5016 !important; }
            .logframe-table .q-total { background: rgba(249,168,37,0.08) !important; }
            .logframe-table .grand-total {
                background: #1a1a0e !important;
                color: #ffca28 !important;
            }
            .logframe-table .grand-total td { color: #ffca28 !important; }
            .logframe-table .cat-cell {
                background: rgba(45,80,22,0.04) !important;
                writing-mode: vertical-rl !important;
            }

            /* ===== BUDGET TABLE ===== */
            .budget-table {
                display: table !important;
                width: 100% !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            .budget-table thead { display: table-header-group !important; }
            .budget-table tbody { display: table-row-group !important; }
            .budget-table tfoot { display: table-footer-group !important; }
            .budget-table tr { display: table-row !important; }
            .budget-table th, .budget-table td {
                display: table-cell !important;
                visibility: visible !important;
                opacity: 1 !important;
            }

            /* ===== NDC SECTION (dark bg) ===== */
            .ndc-section {
                background: #002f1a !important;
                color: white !important;
            }
            .ndc-section::after { display: none !important; }
            .ndc-grid {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 1rem !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            .ndc-card {
                background: rgba(255,255,255,0.08) !important;
                border: 1px solid rgba(255,255,255,0.15) !important;
                opacity: 1 !important;
                visibility: visible !important;
                display: block !important;
                padding: 1.2rem !important;
            }
            .ndc-card h3 { opacity: 1 !important; }
            .ndc-card p { color: rgba(255,255,255,0.65) !important; }

            /* ===== SCALING ===== */
            .scale-flow {
                display: flex !important;
                justify-content: center !important;
                flex-wrap: nowrap !important;
            }
            .scale-step, .scale-arrow {
                display: block !important;
                opacity: 1 !important;
                visibility: visible !important;
            }

            /* ===== YEAR BUDGET BANNER ===== */
            .year-budget-banner {
                display: flex !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            .yb-item { opacity: 1 !important; visibility: visible !important; }

            /* ===== PAGE BREAKS ===== */
            .env-mission { page-break-before: always; }
            .objectives-grid { page-break-before: auto; }
            .capabilities { page-break-before: always; }
            .architecture { page-break-before: always; }
            .logframe { page-break-before: always; }
            .budget { page-break-before: always; }
            .ndc-section { page-break-before: always; }

            .obj-card, .env-card, .cap-item, .ndc-card { page-break-inside: avoid; }
            tr { page-break-inside: avoid; }

            /* Footer */
            footer {
                background: #1a1a0e !important;
                color: rgba(255,255,255,0.5) !important;
                page-break-before: auto;
            }
            footer .footer-logo { color: white !important; }
            footer .footer-logo span { color: #f9a825 !important; }
        """)

        await page.wait_for_timeout(1000)

        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            margin={"top": "0.4in", "bottom": "0.4in", "left": "0.35in", "right": "0.35in"},
            scale=0.68,
        )
        await browser.close()
        print(f"PDF saved to: {pdf_path}")

asyncio.run(main())
