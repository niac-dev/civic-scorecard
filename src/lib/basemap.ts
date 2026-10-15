// Keyless raster basemaps (Esri). CARTO's free tiles watermark non-localhost domains without an API key.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = 'Tiles © Esri';

// Light gray, no labels — replaces CARTO light_nolabels
export const LIGHT_BASEMAP_TILES = [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`];

// Streets with labels — replaces CARTO voyager
export const STREET_BASEMAP_TILES = [`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`];

export const BASEMAP_ATTRIBUTION = ESRI_ATTRIBUTION;
