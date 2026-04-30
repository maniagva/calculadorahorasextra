const fs = require('fs');
try {
  let buf = fs.readFileSync('index.html');
  // Simple heuristic to check for UTF-16LE (BOM is FF FE)
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    let str = buf.toString('utf16le');
    fs.writeFileSync('index.html', str, 'utf8');
    console.log("Converted UTF-16LE to UTF-8");
  } else {
    // maybe it's just messed up, try to read as utf-8
    let str = fs.readFileSync('index.html', 'utf8');
    // fix the missing 'í'
    str = str.replace(/Revisin/g, 'Revisión');
    str = str.replace(/extrados/g, 'extraídos');
    str = str.replace(/dinmicas/g, 'dinámicas');
    fs.writeFileSync('index.html', str, 'utf8');
    console.log("Fixed unicode issues in UTF-8");
  }
} catch (e) {
  console.error(e);
}
