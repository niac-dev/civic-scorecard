// src/components/USMap.tsx
"use client";

import { useEffect } from "react";
import USAMap from "react-usa-map";

type USMapProps = {
  stateColors: Record<string, string>;
  onStateClick: (stateCode: string) => void;
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

export default function USMap({ stateColors, onStateClick }: USMapProps) {
  // Convert state codes to the format expected by react-usa-map
  // All states get custom dark blue fill with teal border
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

  // Add hover effects and tooltips after component mounts
  useEffect(() => {
    const mapContainer = document.querySelector('.us-state-map');
    const svg = mapContainer?.querySelector('svg');
    if (!svg) return;

    const states = document.querySelectorAll('.us-state-map path');

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

        // Create background rectangle for text
        const textBgElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        textBgElement.setAttribute('id', `label-bg-${stateCode}`);
        textBgElement.setAttribute('fill', '#b6dfcc'); // teal background
        textBgElement.setAttribute('rx', '4');
        textBgElement.setAttribute('pointer-events', 'none');

        // Create text label for state name
        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.setAttribute('id', `label-${stateCode}`);
        textElement.setAttribute('x', String(centerX));
        textElement.setAttribute('y', String(centerY));
        textElement.setAttribute('text-anchor', 'middle');
        textElement.setAttribute('dominant-baseline', 'middle');
        textElement.setAttribute('fill', '#000000');
        textElement.setAttribute('font-size', '14');
        textElement.setAttribute('font-weight', 'bold');
        textElement.setAttribute('pointer-events', 'none');
        textElement.textContent = stateName;

        // Append text first to get its bounding box
        svg.appendChild(textElement);

        // Get text dimensions and position background
        const textBBox = textElement.getBBox();
        const padding = 4;
        textBgElement.setAttribute('x', String(textBBox.x - padding));
        textBgElement.setAttribute('y', String(textBBox.y - padding));
        textBgElement.setAttribute('width', String(textBBox.width + padding * 2));
        textBgElement.setAttribute('height', String(textBBox.height + padding * 2));

        // Insert background before text
        svg.insertBefore(textBgElement, textElement);
      });

      stateElement.addEventListener('mouseleave', () => {
        // Reset fill to main map color
        stateElement.setAttribute('fill', '#002b49'); // main map color

        // Remove text label and background
        const label = svg.querySelector(`#label-${stateCode}`);
        const labelBg = svg.querySelector(`#label-bg-${stateCode}`);
        if (label) {
          label.remove();
        }
        if (labelBg) {
          labelBg.remove();
        }
      });
    });
  }, [stateColors]);

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
