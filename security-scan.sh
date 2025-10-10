#!/bin/bash
# security-scan.sh - Comprehensive security analysis for Legal AI App

echo "🔍 Starting comprehensive security analysis for Legal AI App..."

# Create reports directory
mkdir -p reports

# 1. NPM Audit - Dependency vulnerabilities
echo "📦 Scanning dependencies with npm audit..."
npm audit --json > reports/npm-audit.json 2>/dev/null || echo "npm audit failed"

# 2. ESLint Security Analysis
echo "🔍 Running security linting..."
if [ -f "node_modules/.bin/eslint" ]; then
    npx eslint . --ext .js,.ts --format json > reports/eslint-security.json 2>/dev/null || echo "ESLint security scan completed with warnings"
else
    echo "ESLint not found, skipping..."
fi

# 3. Check for hardcoded secrets
echo "🔐 Scanning for hardcoded secrets..."
# Look for actual hardcoded secrets, not legitimate code patterns
grep -r "password\s*=\s*['\"][^'\"]*['\"]\|secret\s*=\s*['\"][^'\"]*['\"]\|api[_-]?key\s*=\s*['\"][^'\"]*['\"]\|token\s*=\s*['\"][^'\"]*['\"]" --include="*.js" --include="*.ts" src/ | \
grep -v "test\|spec\|mock\|TODO\|comment\|//" | \
grep -v "password_hash\|secret_key\|access_key" | \
grep -v "tokenizer\|tokenCount\|tokenCache" > reports/hardcoded-secrets.txt 2>/dev/null || echo "No hardcoded secrets found"

# 4. Check for console.log statements (potential data leakage)
echo "📝 Scanning for potential data leakage..."
grep -r "console\.log\|console\.error\|console\.warn" --include="*.js" --include="*.ts" src/ > reports/console-statements.txt 2>/dev/null || echo "No console statements found"

# 5. Check for eval() usage (security risk)
echo "⚠️ Scanning for eval() usage..."
grep -r "eval(" --include="*.js" --include="*.ts" src/ > reports/eval-usage.txt 2>/dev/null || echo "No eval() usage found"

# 6. Check for SQL injection patterns
echo "💉 Scanning for SQL injection patterns..."
# Look for actual SQL injection risks, not legitimate parameterized queries or HTTP methods
grep -r "SELECT.*\$\|INSERT.*\$\|UPDATE.*\$\|DELETE.*\$" --include="*.js" --include="*.ts" src/ | \
grep -v "test\|spec\|mock" | \
grep -v "\$1\|\$2\|\$3\|\$4\|\$5" | \
grep -v "GET, POST, PUT, DELETE" > reports/sql-patterns.txt 2>/dev/null || echo "No SQL injection patterns found"

# 7. Check for weak crypto usage
echo "🔐 Scanning for crypto usage..."
grep -r "crypto\|hash\|encrypt\|decrypt" --include="*.js" --include="*.ts" src/ > reports/crypto-usage.txt 2>/dev/null || echo "No crypto usage found"

# 8. Check for file system operations
echo "📁 Scanning for file system operations..."
grep -r "fs\.\|readFile\|writeFile\|unlink" --include="*.js" --include="*.ts" src/ > reports/filesystem-ops.txt 2>/dev/null || echo "No filesystem operations found"

# 9. Check for HTTP requests
echo "🌐 Scanning for HTTP requests..."
grep -r "fetch\|axios\|request\|http" --include="*.js" --include="*.ts" src/ > reports/http-requests.txt 2>/dev/null || echo "No HTTP requests found"

# 10. Generate security summary
echo "📊 Generating security summary..."
cat > reports/security-summary.txt << EOF
# Security Analysis Summary
Generated: $(date)

## Critical Issues Found:
$(if [ -s reports/hardcoded-secrets.txt ]; then echo "❌ Hardcoded secrets found"; else echo "✅ No hardcoded secrets"; fi)

$(if [ -s reports/eval-usage.txt ]; then echo "❌ eval() usage found"; else echo "✅ No eval() usage"; fi)

## Dependency Vulnerabilities:
$(if [ -f reports/npm-audit.json ]; then
    VULN_COUNT=$(jq -r '.metadata.vulnerabilities.total // .vulnerabilities.total // 0' reports/npm-audit.json 2>/dev/null || echo "0")
    if [ "$VULN_COUNT" = "0" ] || [ "$VULN_COUNT" = "null" ]; then
        echo "✅ No NPM vulnerabilities"
    else
        echo "❌ NPM vulnerabilities found - check npm-audit.json"
    fi
else
    echo "❌ NPM audit report not found"
fi)

## Code Quality Issues:
$(if [ -s reports/console-statements.txt ]; then echo "⚠️ Console statements found - potential data leakage"; else echo "✅ No console statements"; fi)

$(if [ -s reports/sql-patterns.txt ]; then echo "⚠️ SQL patterns found - review for injection"; else echo "✅ No SQL injection patterns"; fi)

## Security Recommendations:
1. Review hardcoded secrets and move to environment variables
2. Remove or secure console.log statements in production
3. Update vulnerable dependencies
4. Implement proper input validation
5. Add security headers
6. Enable HTTPS in production
7. Implement proper authentication
8. Add rate limiting
9. Implement audit logging
10. Encrypt sensitive data at rest

## Next Steps:
1. Fix critical vulnerabilities immediately
2. Implement security best practices
3. Set up automated security scanning
4. Conduct regular security audits
5. Implement security monitoring

EOF

echo "✅ Security analysis complete!"
echo "📊 Reports generated in reports/ directory:"
ls -la reports/

echo ""
echo "🚨 CRITICAL: Review the following files immediately:"
if [ -s reports/hardcoded-secrets.txt ]; then echo "   - reports/hardcoded-secrets.txt"; fi
if [ -s reports/eval-usage.txt ]; then echo "   - reports/eval-usage.txt"; fi
if [ -f reports/npm-audit.json ]; then
    VULN_COUNT=$(jq -r '.metadata.vulnerabilities.total // .vulnerabilities.total // 0' reports/npm-audit.json 2>/dev/null || echo "0")
    if [ "$VULN_COUNT" != "0" ] && [ "$VULN_COUNT" != "null" ]; then echo "   - reports/npm-audit.json"; fi
fi

echo ""
echo "📋 Security Summary:"
cat reports/security-summary.txt
