# GitHub Actions Workflows

This directory contains the CI/CD workflows for the Toastmasters District Visualizer project.

## Active Workflows

### 1. `ci-cd.yml` - Main CI/CD Pipeline

**Purpose**: Comprehensive continuous integration and deployment pipeline

**Triggers**:

- Push to `main` (post-merge CI)
- Pull requests targeting `main`
- Daily scheduled run at 9 AM UTC for compliance monitoring

**Jobs**:

1. **Quality Gates** - TypeScript zero-error policy and lint compliance
2. **Security** - Vulnerability scanning with Trivy
3. **Test Suite** - Backend and frontend test execution
4. **Brand Compliance** - Automated brand compliance auditing
5. **Build** - Application compilation and bundle analysis
6. **Performance** - Performance monitoring and reporting (main branch only)

**Key Features**:

- ✅ Zero TypeScript error enforcement
- ✅ Automated brand compliance monitoring
- ✅ Security vulnerability scanning
- ✅ Performance bundle analysis
- ✅ PR commenting with detailed results
- ✅ Artifact retention for reports

### 2. `deploy.yml.example` - Production Deployment

**Purpose**: Production deployment workflow template

**Status**: Template - rename to `deploy.yml` and configure for your environment

**Features**:

- Pre-deployment quality gates
- Multi-environment support (staging/production)
- Application building and deployment
- Environment-specific deployments
- Post-deployment verification
- Deployment notifications

## Legacy Workflows (Deprecated)

### `brand-compliance-monitoring.yml` (Legacy)

- **Status**: Disabled - functionality moved to `ci-cd.yml`
- **Action**: Remove after confirming `ci-cd.yml` works correctly

### `typescript-enforcement.yml` (Legacy)

- **Status**: Disabled - functionality moved to `ci-cd.yml`
- **Action**: Remove after confirming `ci-cd.yml` works correctly

## Workflow Dependencies

### Required Scripts (package.json)

```json
{
  "typecheck:backend:all": "npm run typecheck:all --workspace=backend",
  "typecheck:frontend": "npm run typecheck --workspace=frontend",
  "test:backend": "npm run test --workspace=backend",
  "test:frontend": "npm run test --workspace=frontend",
  "build:backend": "npm run build --workspace=backend",
  "build:frontend": "npm run build --workspace=frontend",
  "lint": "npm run lint --workspaces",
  "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\""
}
```

## Environment Setup

### Required Secrets

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### Optional Secrets (for deployment)

- `DEPLOY_SSH_KEY` - SSH key for server deployment
- `KUBECONFIG` - Kubernetes configuration for K8s deployments
- `SLACK_WEBHOOK` - Slack notifications

### Required Permissions

```yaml
permissions:
  contents: read
  packages: write
  security-events: write
  pull-requests: write
```

## Compliance and Quality Standards

### TypeScript Policy Enforcement

- **Zero errors permitted** - builds fail on any TypeScript errors
- **Strict mode required** - all projects must use TypeScript strict mode
- **Type coverage tracking** - monitor percentage of typed vs untyped code

### Brand Compliance Monitoring

- **Automated auditing** - comprehensive brand compliance checks
- **PR feedback** - detailed compliance reports on pull requests
- **Daily monitoring** - scheduled compliance verification
- **Artifact retention** - 30-day report storage

### Security Standards

- **Vulnerability scanning** - Trivy security analysis
- **SARIF reporting** - Security findings uploaded to GitHub Security tab
- **Dependency auditing** - NPM audit integration

## Performance Monitoring

### Bundle Analysis

- **Size tracking** - Monitor CSS and JS bundle sizes
- **Performance reports** - Automated performance analysis
- **Threshold enforcement** - Fail builds on excessive bundle sizes

### Metrics Tracked

- TypeScript error count (target: 0)
- Lint error/warning count (target: 0 errors)
- Brand compliance score (target: 100%)
- Bundle size (threshold: 500KB)
- Test coverage percentage

## Troubleshooting

### Common Issues

1. **TypeScript Errors**

   ```bash
   # Check errors locally
   npm run typecheck:all

   # Fix and verify
   npm run typecheck:all
   ```

2. **Build and Test Failures**

   ```bash
   # Run tests locally
   npm run test

   # Check build status
   npm run build
   ```

3. **Lint Failures**

   ```bash
   # Fix formatting
   npm run format

   # Check lint status
   npm run lint
   ```

### Workflow Debugging

1. **Enable debug logging**:
   - Set `ACTIONS_STEP_DEBUG=true` in repository secrets

2. **Check job dependencies**:
   - Ensure all required scripts exist in package.json
   - Verify workspace configuration

3. **Artifact inspection**:
   - Download compliance reports from workflow artifacts
   - Review detailed error logs in job outputs

## Migration Guide

### From Legacy Workflows

1. **Verify new workflow works**:

   ```bash
   # Test locally first
   npm run typecheck:all
   npm run lint
   npm run test
   ```

2. **Remove legacy workflows**:

   ```bash
   rm .github/workflows/brand-compliance-monitoring.yml
   rm .github/workflows/typescript-enforcement.yml
   ```

3. **Update documentation references**:
   - Update any docs pointing to old workflow names
   - Update badge URLs in README files

### Deployment Setup

1. **Rename deployment template**:

   ```bash
   mv .github/workflows/deploy.yml.example .github/workflows/deploy.yml
   ```

2. **Configure deployment commands**:
   - Update deployment steps for your infrastructure
   - Add environment-specific configurations
   - Set up required secrets

3. **Test deployment workflow**:
   - Use manual trigger first
   - Verify staging deployment
   - Test production deployment process

## Best Practices

### Workflow Maintenance

- Keep workflows simple and focused
- Use job dependencies to optimize execution
- Implement proper error handling
- Maintain clear job naming

### Security

- Use pinned action versions (e.g., `@v4` not `@latest`)
- Minimize required permissions
- Avoid exposing secrets in logs
- Regular security scanning

### Performance

- Use caching for dependencies
- Parallel job execution where possible
- Monitor workflow execution times

## Support

For workflow issues:

1. Check job logs in GitHub Actions tab
2. Review this documentation
3. Test commands locally first
4. Check repository settings and secrets
5. Consult GitHub Actions documentation
