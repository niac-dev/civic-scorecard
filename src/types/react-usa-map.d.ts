declare module 'react-usa-map' {
  import { ComponentType } from 'react';

  interface USAMapProps {
    customize?: Record<string, { fill: string }>;
    onClick?: (event: React.MouseEvent<SVGElement>) => void;
    defaultFill?: string;
    width?: string | number;
    height?: string | number;
    title?: string;
  }

  const USAMap: ComponentType<USAMapProps>;
  export default USAMap;
}
