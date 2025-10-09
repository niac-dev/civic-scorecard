#!/usr/bin/env python3
"""
Merge biographical data from lawmakers.csv into scores_wide.csv
"""

import csv
import sys

def main():
    # Read lawmakers data
    lawmakers = {}
    with open('public/data/lawmakers.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            bioguide_id = row['bioguide_id']
            lawmakers[bioguide_id] = {
                'district': row.get('district', ''),
                'office_phone': row.get('office_phone', ''),
                'office_address': row.get('office_address', ''),
                'district_offices': row.get('district_offices', ''),
                'aipac_supported': row.get('aipac_supported', ''),
                'dmfi_supported': row.get('dmfi_supported', ''),
            }

    # Read scores_wide.csv
    scores_rows = []
    fieldnames = []
    with open('public/data/scores_wide.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)

        # Add new fields at the end if they don't exist
        new_fields = ['district', 'office_phone', 'office_address', 'district_offices', 'aipac_supported', 'dmfi_supported']
        for field in new_fields:
            if field not in fieldnames:
                fieldnames.append(field)

        for row in reader:
            bioguide_id = row.get('bioguide_id', '')

            # Merge lawmaker data if available
            if bioguide_id in lawmakers:
                lawmaker_data = lawmakers[bioguide_id]
                for key, value in lawmaker_data.items():
                    row[key] = value
            else:
                # Fill with empty values
                for field in new_fields:
                    if field not in row:
                        row[field] = ''

            scores_rows.append(row)

    # Write updated scores_wide.csv
    with open('public/data/scores_wide.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(scores_rows)

    print(f"Successfully merged data for {len(scores_rows)} lawmakers")
    print(f"Matched {len([r for r in scores_rows if r.get('aipac_supported') or r.get('dmfi_supported')])} lawmakers with AIPAC/DMFI data")

if __name__ == '__main__':
    main()
