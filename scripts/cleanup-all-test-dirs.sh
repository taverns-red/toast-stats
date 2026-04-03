#!/bin/bash

# Comprehensive cleanup script for all test directories across the entire project
# This script removes all temporary test directories from both frontend and backend

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Starting project-wide test directory cleanup...${NC}"
echo ""

# Counter for total cleaned directories
TOTAL_CLEANED=0

# Function to run cleanup script if it exists
run_cleanup_script() {
    local script_path=$1
    local component_name=$2
    
    if [ -f "$script_path" ]; then
        echo -e "${YELLOW}Cleaning $component_name test directories...${NC}"
        cd "$(dirname "$script_path")"
        bash "$(basename "$script_path")"
        cd - > /dev/null
        echo ""
    else
        echo -e "${YELLOW}No cleanup script found for $component_name at $script_path${NC}"
    fi
}

# Clean frontend test directories
run_cleanup_script "frontend/scripts/cleanup-test-dirs.sh" "frontend"

# Clean any root-level test directories
if [ -d "./test-dir" ]; then
    echo -e "${YELLOW}Cleaning root-level test directories...${NC}"
    
    # Count directories before cleanup
    before_count=$(find ./test-dir -maxdepth 1 -type d -name "test-*" 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$before_count" -gt 0 ]; then
        echo "  Found $before_count root-level test directories"
        find ./test-dir -maxdepth 1 -type d -name "test-*" -exec rm -rf {} + 2>/dev/null || true
        
        # Count directories after cleanup
        after_count=$(find ./test-dir -maxdepth 1 -type d -name "test-*" 2>/dev/null | wc -l | tr -d ' ')
        cleaned_count=$((before_count - after_count))
        TOTAL_CLEANED=$((TOTAL_CLEANED + cleaned_count))
        
        if [ "$cleaned_count" -gt 0 ]; then
            echo -e "  ${GREEN}✅ Cleaned $cleaned_count root-level directories${NC}"
        fi
    else
        echo "  No root-level test directories found"
    fi
    
    # Remove root test-dir if empty
    if [ -z "$(ls -A ./test-dir 2>/dev/null)" ]; then
        rmdir ./test-dir 2>/dev/null || true
        echo -e "  ${GREEN}🗑️  Removed empty root test-dir${NC}"
    fi
    echo ""
fi

echo -e "${GREEN}✅ Project-wide cleanup completed!${NC}"
echo -e "${GREEN}🎉 All test directories have been cleaned${NC}"