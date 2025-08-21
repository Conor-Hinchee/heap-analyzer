#!/bin/bash

# Interactive file picker for ~/Desktop/leaky ships
dir="$HOME/Desktop/leaky ships"


# Use absolute path for snapshots_dir
snapshots_dir="$(cd "$(dirname "$0")/../snapshots" && pwd)"
target_file="$snapshots_dir/single.heapsnapshot"

# Ensure snapshots directory exists
mkdir -p "$snapshots_dir"

# List .heapsnapshot files and prompt for selection
cd "$dir" || { echo "Directory not found: $dir"; exit 1; }

files=( *.heapsnapshot )
if [ ${#files[@]} -eq 0 ]; then
  echo "No .heapsnapshot files found in $dir"
  exit 1
fi

echo "Select a file to copy as single.heapsnapshot:"
select file in "${files[@]}"; do
  if [[ -n "$file" ]]; then
    # Show source and destination for debugging
    echo "Copying from: $dir/$file"
    echo "Copying to:   $target_file"
    cp -f "$file" "$target_file"
    echo "Copied $file to $target_file"
    exit 0
  else
    echo "Invalid selection. Try again."
  fi
done
