#!/bin/bash

echo "=== Service Dependency Analysis ==="
echo ""

# Find all service files
services=($(find src/services -name "*.service.ts" -not -name "*.spec.ts" | sort))

for service in "${services[@]}"; do
    echo "$(basename $service):"
    
    # Find service imports in this file
    service_imports=$(grep -n "import.*Service.*from.*service" "$service" 2>/dev/null || true)
    
    if [ -n "$service_imports" ]; then
        echo "$service_imports" | while read -r line; do
            echo "  └─ $line"
        done
    else
        echo "  └─ No service imports"
    fi
    echo ""
done

echo "=== Checking for potential cycles ==="
echo ""

# Check each service file for imports that might create cycles
for service in "${services[@]}"; do
    service_name=$(basename "$service" .ts)
    echo "Checking $service_name for cycles..."
    
    # Get all services that import this one
    importers=$(grep -l "$service_name" src/services/*.service.ts 2>/dev/null | grep -v "$service" || true)
    
    if [ -n "$importers" ]; then
        for importer in $importers; do
            importer_name=$(basename "$importer" .ts)
            # Check if this service imports the importer back
            cycle_check=$(grep "$importer_name" "$service" 2>/dev/null || true)
            if [ -n "$cycle_check" ]; then
                echo "  ⚠️  POTENTIAL CYCLE: $service_name ↔ $importer_name"
                echo "    $service_name imports: $cycle_check"
                echo "    $importer_name imports this service"
            fi
        done
    fi
done
