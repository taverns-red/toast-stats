# Cache Configuration Guide

## Overview

The Toastmasters District Visualizer uses a unified cache configuration system that allows all cache locations to be configured through a single `CACHE_DIR` environment variable. This guide provides configuration examples for different deployment scenarios.

## Environment Variable

### CACHE_DIR

**Purpose**: Configures the base directory for all cache operations across the application.

**Default**: `./cache` (relative to the application root)

**Format**: Absolute or relative path to the cache directory

**Example**:

```bash
CACHE_DIR=/var/cache/toastmasters
```

## Configuration Examples

### Development Environment

For local development, use a relative path:

```bash
# .env (development)
CACHE_DIR=./cache
```

This creates a cache directory in your project root, making it easy to inspect cached data during development.

### Production Environment

For production deployments, use an absolute path:

```bash
# in the environment of the process that runs the collector
export CACHE_DIR=/var/cache/toastmasters
```

### Docker Deployment

#### Docker Compose

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    environment:
      - CACHE_DIR=/app/cache
    volumes:
      - cache-data:/app/cache
    # ... other configuration

volumes:
  cache-data:
```

#### Dockerfile

```dockerfile
# Set cache directory
ENV CACHE_DIR=/app/cache

# Create cache directory with proper permissions
RUN mkdir -p /app/cache && \
    chown -R nodejs:nodejs /app/cache

# Mount point for cache volume
VOLUME ["/app/cache"]
```

### Kubernetes Deployment

#### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: toastmasters-config
data:
  cache-dir: '/var/cache/toastmasters'
```

#### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: toastmasters-backend
spec:
  template:
    spec:
      containers:
        - name: backend
          image: toastmasters-backend:latest
          env:
            - name: CACHE_DIR
              valueFrom:
                configMapKeyRef:
                  name: toastmasters-config
                  key: cache-dir
          volumeMounts:
            - name: cache-volume
              mountPath: /var/cache/toastmasters
      volumes:
        - name: cache-volume
          persistentVolumeClaim:
            claimName: toastmasters-cache-pvc
```

#### Persistent Volume Claim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: toastmasters-cache-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### Testing Environment

For automated testing, use project-local test directories:

```bash
# GitHub Actions
CACHE_DIR=./test-dir/test-cache-${{ github.run_id }}

# Local testing
CACHE_DIR=./test-dir/toastmasters-test-cache
```

### CI/CD Pipeline

#### GitHub Actions

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
        working-directory: ./backend
      - name: Run tests
        env:
          CACHE_DIR: ${{ github.workspace }}/backend/cache
        run: npm test
        working-directory: ./backend
```

#### Jenkins

```groovy
pipeline {
    agent any
    environment {
        CACHE_DIR = "${WORKSPACE}/backend/cache"
    }
    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }
    }
}
```

## Cache Directory Structure

The cache directory will contain the following structure:

```
cache/
├── districts/
│   ├── {districtId}/
│   │   └── {YYYY-MM-DD}.json
├── districts_{YYYY-MM-DD}.json
├── metadata_{YYYY-MM-DD}.json
├── historical_index.json
└── reconciliation/
    └── {various reconciliation files}
```

## Security Considerations

### Path Validation

The system automatically validates cache directory paths to prevent security issues:

- **Path Traversal Prevention**: Paths containing `..` or other traversal attempts are rejected
- **Permission Verification**: Write permissions are checked during initialization
- **Safe Path Resolution**: All paths are resolved using `path.resolve()` for security

### Recommended Practices

1. **Use Absolute Paths in Production**: Avoid relative paths in production environments
2. **Set Proper Permissions**: Ensure the application user has read/write access to the cache directory
3. **Isolate Cache Data**: Use dedicated directories for cache data, separate from application code
4. **Regular Cleanup**: Implement cache cleanup policies for long-running deployments

## Troubleshooting

### Common Issues

#### Cache Directory Not Found

**Error**: `ENOENT: no such file or directory`

**Solution**: Ensure the cache directory exists and has proper permissions:

```bash
mkdir -p /var/cache/toastmasters
chown app:app /var/cache/toastmasters
chmod 755 /var/cache/toastmasters
```

#### Permission Denied

**Error**: `EACCES: permission denied`

**Solution**: Check directory permissions and ownership:

```bash
# Check permissions
ls -la /var/cache/toastmasters

# Fix permissions
chown -R app:app /var/cache/toastmasters
chmod -R 755 /var/cache/toastmasters
```

#### Path Traversal Rejected

**Error**: `Invalid cache directory path`

**Solution**: Use absolute paths without traversal characters:

```bash
# Good
CACHE_DIR=/var/cache/toastmasters

# Bad
CACHE_DIR=../../../etc/passwd
```

### Validation Commands

Test your cache configuration:

```bash
# Check if directory exists and is writable
test -w "$CACHE_DIR" && echo "Cache directory is writable" || echo "Cache directory is not writable"

# Create test file
touch "$CACHE_DIR/test.txt" && rm "$CACHE_DIR/test.txt" && echo "Cache directory works" || echo "Cache directory failed"
```

## Migration from Legacy Configuration

### From DISTRICT_CACHE_DIR

If you were previously using `DISTRICT_CACHE_DIR`, migrate to `CACHE_DIR`:

```bash
# Old configuration
DISTRICT_CACHE_DIR=/path/to/cache

# New configuration
CACHE_DIR=/path/to/cache
```

The cache directory structure and data remain unchanged, only the environment variable name has changed.

### Deployment Migration Steps

1. **Update Environment Variables**: Change `DISTRICT_CACHE_DIR` to `CACHE_DIR` in your deployment configuration
2. **Update Documentation**: Update any deployment scripts or documentation references
3. **Test Configuration**: Verify the application starts correctly with the new configuration
4. **Remove Old Variables**: Clean up any remaining `DISTRICT_CACHE_DIR` references

## Performance Considerations

### Cache Directory Location

- **Local Storage**: Fastest access, but limited to single node
- **Network Storage**: Slower access, but supports multi-node deployments
- **SSD vs HDD**: SSD recommended for better I/O performance

### Cache Size Management

Monitor cache directory size and implement cleanup policies:

```bash
# Check cache size
du -sh $CACHE_DIR

# Clean old cache files (example: older than 30 days)
find $CACHE_DIR -type f -mtime +30 -delete
```

## Support

For additional help with cache configuration:

1. Check the application logs for detailed error messages
2. Verify environment variable values using `printenv | grep CACHE`
3. Test directory permissions using the validation commands above
4. Consult the main application documentation for deployment-specific guidance
