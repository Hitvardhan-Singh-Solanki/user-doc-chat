# SonarQube Secrets Setup Guide

## 🔐 Required GitHub Secrets

You need to add the following secrets to your GitHub repository for SonarQube integration to work:

### 1. **SONAR_TOKEN** (Required)
- **What it is**: Authentication token for SonarQube
- **How to get it**:
  1. Go to your SonarQube instance
  2. Click on your profile → My Account → Security
  3. Generate a new token
  4. Copy the token value

### 2. **SONAR_HOST_URL** (Required)
- **What it is**: URL of your SonarQube instance
- **Examples**:
  - `https://sonarcloud.io` (for SonarCloud)
  - `https://your-company-sonar.com` (for self-hosted)
  - `http://localhost:9000` (for local development)

### 3. **SONAR_ORGANIZATION** (Required for SonarCloud)
- **What it is**: Your SonarCloud organization key
- **How to find it**: In SonarCloud, go to Organization → Administration → Organization
- **Note**: Only needed for SonarCloud, not for self-hosted SonarQube

## 🚀 How to Add Secrets to GitHub

### Method 1: GitHub Web Interface
1. Go to your repository on GitHub
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with the exact names:
   - `SONAR_TOKEN`
   - `SONAR_HOST_URL`
   - `SONAR_ORGANIZATION` (if using SonarCloud)

### Method 2: GitHub CLI
```bash
# Install GitHub CLI if you haven't
gh auth login

# Add secrets
gh secret set SONAR_TOKEN --body "your-sonar-token-here"
gh secret set SONAR_HOST_URL --body "https://sonarcloud.io"
gh secret set SONAR_ORGANIZATION --body "your-org-key"
```

## 🔧 SonarQube Instance Setup

### Option 1: SonarCloud (Recommended for Open Source)
1. Go to [sonarcloud.io](https://sonarcloud.io)
2. Sign in with GitHub
3. Create a new project
4. Get your organization key and token

### Option 2: Self-Hosted SonarQube
1. Set up SonarQube server
2. Create a project
3. Generate a token
3. Use your server URL

## 📋 Verification Steps

### 1. Check Secrets are Set
```bash
# List all secrets (if using GitHub CLI)
gh secret list
```

### 2. Test Local Connection
```bash
# Test with local SonarQube
npm run sonar:local

# Test with cloud SonarQube
SONAR_TOKEN=your-token SONAR_HOST_URL=https://sonarcloud.io npm run sonar
```

### 3. Check GitHub Actions
1. Go to your repository
2. Click **Actions** tab
3. Look for "SonarQube Quality Gate" workflow
4. Check if it runs successfully

## 🚨 Troubleshooting

### Common Issues

#### 1. "Set the SONAR_TOKEN env variable"
- **Cause**: SONAR_TOKEN secret not set in GitHub
- **Fix**: Add the secret in repository settings

#### 2. "Invalid token"
- **Cause**: Wrong or expired token
- **Fix**: Generate a new token in SonarQube

#### 3. "Organization not found"
- **Cause**: Wrong organization key or not using SonarCloud
- **Fix**: Check organization key or remove SONAR_ORGANIZATION for self-hosted

#### 4. "Project not found"
- **Cause**: Project doesn't exist in SonarQube
- **Fix**: Create the project in SonarQube first

### Debug Commands

```bash
# Check if secrets are accessible in workflow
echo "SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}"
echo "SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}"
echo "SONAR_ORGANIZATION: ${{ secrets.SONAR_ORGANIZATION }}"
```

## 📊 Expected Workflow Behavior

### Successful Run
1. ✅ Code checkout
2. ✅ Node.js setup
3. ✅ Dependencies installation
4. ✅ Type checking
5. ✅ Linting
6. ✅ Test coverage generation
7. ✅ SonarQube analysis
8. ✅ Quality gate check

### Quality Gate Results
- **PASS**: All quality criteria met
- **FAIL**: One or more criteria not met (coverage, complexity, etc.)

## 🔄 Workflow Triggers

The workflow runs on:
- **Pull requests** to `main` or `develop` branches
- **Push** to `main` or `develop` branches

## 📈 Coverage Requirements

Current thresholds:
- **Coverage**: 80% minimum
- **Complexity**: 8 maximum per function
- **Maintainability**: A rating
- **Reliability**: A rating
- **Security**: A rating

## 🎯 Next Steps After Setup

1. **First Run**: The workflow will create the project in SonarQube
2. **Review Results**: Check the SonarQube dashboard for analysis results
3. **Improve Coverage**: Add tests to reach 80% coverage threshold
4. **Monitor Trends**: Track quality improvements over time

## 📞 Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Verify all secrets are set correctly
3. Ensure SonarQube project exists
4. Review the troubleshooting section above
