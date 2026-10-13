"""Read config.js (an ES module) and update its machine-maintained reviews.years line. Needs node."""
import json, os, re, subprocess

_READ = ("const fs=require('fs');import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(process.argv[1],'utf8')))"
         ".then(m=>process.stdout.write(JSON.stringify(m.default)))")


def load(root):
    out = subprocess.run(['node', '-e', _READ, os.path.join(root, 'config.js')], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def set_years(root, years):
    """Rewrite the single `years: [...]` array in config.js; everything else (comments included) is left alone."""
    path = os.path.join(root, 'config.js')
    src = open(path).read()
    new, n = re.subn(r'\byears:\s*\[[^\]]*\]', 'years: [' + ', '.join(str(y) for y in years) + ']', src, count=1)
    if n != 1:
        raise SystemExit('config.js: could not find reviews `years: [...]` to update')
    with open(path, 'w') as f:
        f.write(new)
