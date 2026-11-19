import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

console.log('=== GITLEAKS & SECRET SCANNER ===\n');

// Standard Gitleaks detection rules
const RULES = [
  { id: 'private-key', name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { id: 'supabase-service-key', name: 'Supabase Service Role Key / Secret JWT', regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { id: 'db-connection-string', name: 'Database URI with Password', regex: /postgres(?:ql)?:\/\/[a-zA-Z0-9_.-]+:[^@\s/]+@[a-zA-Z0-9_.-]+/ },
  { id: 'generic-api-key', name: 'Generic API Key / Secret Token', regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
  { id: 'hardcoded-password', name: 'Hardcoded Password Assignment', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { id: 'aws-access-key', name: 'AWS Access Key ID', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/ },
  { id: 'slack-token', name: 'Slack Token', regex: /xox[baprs]-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}/ },
  { id: 'github-pat', name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/ }
];

// Paths to ignore during scanning
const IGNORE_PATHS = [
  '.git', 'node_modules', 'build-out', 'release', 'dist/bundle', '.gemini', 'package-lock.json', 'check-git-leaks.mjs'
];

const findings = [];

// 1. Scan current working files
function scanDirectory(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (IGNORE_PATHS.includes(entry)) continue;
    const fullPath = join(dir, entry);
    try {
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        scanDirectory(fullPath);
      } else if (st.isFile()) {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, lineNum) => {
          // Skip comments or test mock tokens if explicitly flagged as mock
          for (const rule of RULES) {
            const m = rule.regex.exec(line);
            if (m) {
              findings.push({
                type: 'Working File',
                file: fullPath,
                line: lineNum + 1,
                rule: rule.name,
                match: m[0].slice(0, 40) + '...',
                fullLine: line.trim()
              });
            }
          }
        });
      }
    } catch {
      // Ignore binary files or unreadable files
    }
  }
}

// 2. Scan Git Commit History
function scanGitHistory() {
  try {
    const commits = execSync('git log --pretty=format:"%H|%s" -n 50', { encoding: 'utf8' }).trim().split('\n');
    for (const line of commits) {
      if (!line) continue;
      const [hash, subject] = line.split('|');
      const diff = execSync(`git show ${hash}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const diffLines = diff.split('\n');
      let currentFile = '';
      diffLines.forEach((dLine, idx) => {
        if (dLine.startsWith('+++ b/')) {
          currentFile = dLine.replace('+++ b/', '');
        } else if (dLine.startsWith('+') && !dLine.startsWith('+++')) {
          const addedContent = dLine.slice(1);
          for (const rule of RULES) {
            const m = rule.regex.exec(addedContent);
            if (m) {
              findings.push({
                type: 'Git History Commit',
                commit: hash.slice(0, 8),
                commitSubject: subject,
                file: currentFile,
                line: idx,
                rule: rule.name,
                match: m[0].slice(0, 40) + '...',
                fullLine: addedContent.trim()
              });
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('Git history check error:', err.message);
  }
}

console.log('1. Scanning working repository files...');
scanDirectory(process.cwd());

console.log('2. Scanning Git commit history diffs...');
scanGitHistory();

console.log(`\nScan Complete! Found ${findings.length} potential secrets / leaks:\n`);
findings.forEach((f, idx) => {
  console.log(`[${idx + 1}] [${f.type}] ${f.rule}`);
  console.log(`    Location: ${f.file}${f.commit ? ` (Commit: ${f.commit} - ${f.commitSubject})` : ` (Line ${f.line})`}`);
  console.log(`    Snippet:  ${f.fullLine.slice(0, 100)}`);
  console.log('');
});
