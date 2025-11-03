// src/components/USMap.tsx
"use client";

import { useEffect } from "react";
import USAMap from "react-usa-map";
import DistrictMap from "./DistrictMap";
import type { Row } from "@/lib/types";

type USMapProps = {
  stateColors: Record<string, string>;
  onStateClick: (stateCode: string) => void;
  members?: Row[];
  onMemberClick?: (member: Row) => void;
  useDistrictMap?: boolean;
  chamber?: string;
};

// State names mapping
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export default function USMap({ stateColors, onStateClick, members, onMemberClick, useDistrictMap = false, chamber }: USMapProps) {
  // Add hover effects and tooltips after component mounts
  useEffect(() => {
    // Only run effect if not using district map
    if (useDistrictMap && members) return;
    const mapContainer = document.querySelector('.us-state-map');
    const svg = mapContainer?.querySelector('svg');
    if (!svg) return;

    const states = document.querySelectorAll<SVGPathElement>('.us-state-map path');

    states.forEach((state) => {
      const stateElement = state as SVGPathElement;
      const stateCode = stateElement.dataset.name?.toUpperCase();
      const stateName = stateCode ? STATE_NAMES[stateCode] : '';

      // Remove any existing title elements (native tooltips)
      const existingTitle = stateElement.querySelector('title');
      if (existingTitle) {
        existingTitle.remove();
      }

      // Set teal border on all states
      stateElement.setAttribute('stroke', '#b6dfcc'); // border color
      stateElement.setAttribute('stroke-width', '1');

      // Add drop shadow and label on hover
      stateElement.addEventListener('mouseenter', () => {
        const bbox = stateElement.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        // Change to hover color
        stateElement.setAttribute('fill', '#4699d3'); // hover color

        // Create text label for state name with white fill and black stroke
        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.setAttribute('id', `label-${stateCode}`);
        textElement.setAttribute('x', String(centerX));
        textElement.setAttribute('y', String(centerY));
        textElement.setAttribute('text-anchor', 'middle');
        textElement.setAttribute('dominant-baseline', 'middle');
        textElement.setAttribute('fill', 'white');
        textElement.setAttribute('stroke', 'black');
        textElement.setAttribute('stroke-width', '3');
        textElement.setAttribute('stroke-linejoin', 'round');
        textElement.setAttribute('paint-order', 'stroke');
        textElement.setAttribute('font-size', '14');
        textElement.setAttribute('font-weight', 'bold');
        textElement.setAttribute('pointer-events', 'none');
        textElement.textContent = stateName;

        // Append text
        svg.appendChild(textElement);
      });

      stateElement.addEventListener('mouseleave', () => {
        // Reset fill to main map color
        stateElement.setAttribute('fill', '#002b49'); // main map color

        // Remove text label
        const label = svg.querySelector(`#label-${stateCode}`);
        if (label) {
          label.remove();
        }
      });
    });
  }, [stateColors, useDistrictMap, members]);

  // If district map is requested and we have member data, render it
  if (useDistrictMap && members) {
    return <DistrictMap members={members} onMemberClick={onMemberClick} onStateClick={onStateClick} chamber={chamber} />;
  }

  // Helper functions for the state map
  const customizeMap = () => {
    const config: Record<string, { fill: string; stroke?: string; strokeWidth?: string }> = {};
    Object.keys(stateColors).forEach((code) => {
      config[code] = {
        fill: "#002b49", // main map color
      };
    });
    return config;
  };

  const handleStateClick = (event: React.MouseEvent<SVGElement>) => {
    // react-usa-map passes the state code in event.target.dataset.name
    const target = event.target as SVGElement & { dataset: { name?: string } };
    const stateCode = target.dataset.name;
    if (stateCode) {
      onStateClick(stateCode.toUpperCase());
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="us-state-map">
        <USAMap
          customize={customizeMap()}
          onClick={handleStateClick}
          defaultFill="#002b49"
          width="100%"
          height="auto"
          title=""
        />
      </div>
    </div>
  );
}
