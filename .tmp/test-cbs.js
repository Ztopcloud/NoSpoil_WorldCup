var pw = require('playwright');
var fs = require('fs');
(async function() {
  var b = await pw.chromium.launch({ headless: true });
  var p = await b.newPage();
  console.log('Going to CBS...');
  await p.goto('https://cbs.sports.cctv.com/index.html#3400', { timeout: 60000, waitUntil: 'networkidle' });
  console.log('Page loaded, waiting extra 5s...');
  await new Promise(function(r) { setTimeout(r, 5000); });
  var html = await p.content();
  fs.writeFileSync('/tmp/cbs-html.txt', html);
  console.log('HTML saved, length:', html.length);
  var p1 = html.match(/href=["'][^"']*worldcup\.cctv\.com\/2026\/match\/\d+\/index\.shtml["']/gi) || [];
  console.log('Pattern 1 (href):', p1.length, p1.slice(0,3));
  var p2 = (html.match(/229\d{5}/g) || []);
  console.log('Pattern 2 (229* IDs):', p2.length);
  var p3 = (html.match(/https?:\/\/[^"\s]+api[^"\s]+/gi) || []);
  console.log('API URLs found:', p3.length, p3.slice(0,5));
  await b.close();
})().catch(function(e) {
  console.log('ERROR:', e.message);
  process.exit(1);
});
