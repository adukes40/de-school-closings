import React, { useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';

// Color scheme for status types
const STATUS_COLORS = {
  closed: '#ef4444',
  delay: '#f59e0b',
  'early dismissal': '#f97316',
  open: '#22c55e',
};

const STATUS_LABELS = {
  closed: 'Closed',
  delay: 'Delay',
  'early dismissal': 'Early Dismissal',
  open: 'Open',
};

// Delaware bounding box
const delawareBounds = [
  [38.45, -75.82],
  [39.84, -74.95],
];

function getStatusForDistrict(districtName, closingsByDistrict) {
  const closing = closingsByDistrict[districtName];
  if (!closing) return null;
  return closing;
}

function getColor(statusType) {
  return STATUS_COLORS[statusType] || STATUS_COLORS.open;
}

const SchoolClosingsMap = ({ districts, closingsByDistrict }) => {
  const geoJsonRef = useRef(null);

  // Style each district polygon
  const styleFeature = useCallback((feature) => {
    const closing = getStatusForDistrict(feature.properties.NAME, closingsByDistrict);
    const hasClosing = !!closing;
    const color = hasClosing ? getColor(closing.statusType) : '#30363d';

    return {
      fillColor: color,
      fillOpacity: hasClosing ? 0.45 : 0.08,
      color: hasClosing ? color : '#484f58',
      weight: hasClosing ? 2.5 : 1,
      opacity: 1,
    };
  }, [closingsByDistrict]);

  // Hover highlight + tooltip behavior
  const onEachFeature = useCallback((feature, layer) => {
    const districtName = feature.properties.NAME;
    const closing = getStatusForDistrict(districtName, closingsByDistrict);

    // Build tooltip content
    let tooltipHtml;
    if (closing) {
      const color = getColor(closing.statusType);
      const label = STATUS_LABELS[closing.statusType] || closing.statusType;
      tooltipHtml = `
        <div style="font-family:'Inter',system-ui,sans-serif;min-width:200px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#e6edf3">
            ${districtName}
          </div>
          <div style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-bottom:6px">
            ${label}
          </div>
          <div style="font-size:12px;color:#c9d1d9;line-height:1.4;margin-top:4px">
            ${closing.status}
          </div>
          ${closing.date ? `<div style="font-size:10px;color:#8b949e;margin-top:4px">${closing.date}</div>` : ''}
        </div>
      `;
    } else {
      tooltipHtml = `
        <div style="font-family:'Inter',system-ui,sans-serif">
          <div style="font-weight:700;font-size:13px;color:#e6edf3">
            ${districtName}
          </div>
          <div style="font-size:11px;color:#3fb950;margin-top:4px">No closings reported</div>
        </div>
      `;
    }

    layer.bindTooltip(tooltipHtml, {
      sticky: true,
      direction: 'auto',
      offset: [15, 0],
      opacity: 1,
      className: 'district-tooltip',
      interactive: false,
    });

    // Hover highlight
    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 3,
          fillOpacity: closing ? 0.65 : 0.2,
          color: closing ? getColor(closing.statusType) : '#8b949e',
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          l.bringToFront();
        }
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      },
    });
  }, [closingsByDistrict]);

  return (
    <MapContainer
      center={[39.05, -75.45]}
      zoom={9}
      minZoom={8}
      maxZoom={13}
      maxBounds={delawareBounds}
      maxBoundsViscosity={0.9}
      style={{ height: 'calc(100vh - 52px)', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />
      {districts && districts.features && (
        <GeoJSON
          ref={geoJsonRef}
          data={districts}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      )}
    </MapContainer>
  );
};

export default SchoolClosingsMap;
