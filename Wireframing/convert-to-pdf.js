const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, 'index.html');
  await page.goto(`file://${filePath}`, {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready');

  // Wait extra time for animations to complete
  await new Promise(r => setTimeout(r, 3000));

  // Force all reveal elements to be visible and remove scroll-snap for PDF
  await page.evaluate(() => {
    // Make all reveals visible
    document.querySelectorAll('.reveal').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      el.style.transition = 'none';
      el.classList.add('visible');
    });

    // Make hero elements visible
    document.querySelectorAll('.hero-badge, .hero-title, .hero-sub, .hero-stats').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      el.style.animation = 'none';
    });

    // Remove scroll snap - each slide should be its own page
    document.documentElement.style.scrollSnapType = 'none';

    // Hide nav dots
    const navDots = document.querySelector('.nav-dots');
    if (navDots) navDots.style.display = 'none';

    // Force budget bars to animate
    document.querySelectorAll('.b-bar').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
      bar.style.transition = 'none';
    });

    // Set each slide to exact page dimensions for clean page breaks
    document.querySelectorAll('.slide').forEach((slide, i) => {
      slide.style.scrollSnapAlign = 'none';
      slide.style.minHeight = '100vh';
      slide.style.height = '100vh';
      slide.style.maxHeight = '100vh';
      slide.style.overflow = 'hidden';
      slide.style.pageBreakAfter = 'always';
      slide.style.breakAfter = 'page';
      // Ensure no margin/padding bleeds between slides
      slide.style.marginBottom = '0';
      slide.style.paddingBottom = '40px';
    });

    // Remove page-break-after from last slide
    const slides = document.querySelectorAll('.slide');
    if (slides.length > 0) {
      const last = slides[slides.length - 1];
      last.style.pageBreakAfter = 'auto';
      last.style.breakAfter = 'auto';
    }
  });

  // Generate PDF - landscape for presentation feel
  await page.pdf({
    path: path.resolve(__dirname, 'WOREX_MooMe_PitchDeck.pdf'),
    width: '1920px',
    height: '1080px',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: false
  });

  console.log('PDF generated: WOREX_MooMe_PitchDeck.pdf');
  await browser.close();
})();
