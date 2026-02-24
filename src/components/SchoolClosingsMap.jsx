import React, { useRef, useCallback, useMemo, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

// ── Constants ────────────────────────────────────────────────────────
const STATUS_COLORS = {
  closed: '#ef4444',
  delay: '#f59e0b',
  'early dismissal': '#f97316',
  info: '#3b82f6',
  open: '#22c55e',
};

const STATUS_LABELS = {
  closed: 'Closed',
  delay: 'Delay',
  'early dismissal': 'Early Dismissal',
  info: 'Informational',
  open: 'Open',
};

const delawareBounds = [
  [38.45, -75.82],
  [39.84, -74.95],
];

function getColor(statusType) {
  return STATUS_COLORS[statusType] || STATUS_COLORS.open;
}

// ── SVG icon paths (16×16 viewBox) ───────────────────────────────────
// Gear / cog — represents vocational-technical
const GEAR_SVG = `<path fill="#fff" d="M8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm5.2-1.8-.5-.3a.6.6 0 0 1-.2-.7l.2-.5a1 1 0 0 0-.2-1.1l-.8-.8a1 1 0 0 0-1.1-.2l-.5.2a.6.6 0 0 1-.7-.2l-.3-.5A1 1 0 0 0 8.2 4h-1a1 1 0 0 0-.9.6l-.2.5a.6.6 0 0 1-.7.2l-.5-.2a1 1 0 0 0-1.1.2l-.7.8a1 1 0 0 0-.2 1l.2.6a.6.6 0 0 1-.2.7l-.5.2a1 1 0 0 0-.6.9v1a1 1 0 0 0 .6.9l.5.3a.6.6 0 0 1 .2.7l-.2.5a1 1 0 0 0 .2 1.1l.7.7a1 1 0 0 0 1.1.2l.5-.2a.6.6 0 0 1 .7.2l.3.5a1 1 0 0 0 .9.6h1a1 1 0 0 0 .9-.6l.2-.5a.6.6 0 0 1 .7-.2l.5.2a1 1 0 0 0 1.1-.2l.8-.7a1 1 0 0 0 .2-1.1l-.2-.5a.6.6 0 0 1 .2-.7l.5-.3a1 1 0 0 0 .5-.9v-1a1 1 0 0 0-.5-.8Z"/>`;

// Open book — represents charter / academic
const BOOK_SVG = `<path fill="#fff" d="M2 3.5c1.5-1 3.5-1 5-.5l1 .4 1-.4c1.5-.5 3.5-.5 5 .5v9c-1.5-.8-3.3-.8-4.8-.2L8 13l-2.2-.7C4.3 11.7 3.5 11.7 2 12.5v-9ZM7.5 5 7 4.8c-1.2-.4-2.7-.3-3.8.4v6.3c1.2-.5 2.6-.5 3.8-.1l.5.2V5Zm1 6.6.5-.2c1.2-.4 2.6-.4 3.8.1V5.2c-1.1-.7-2.6-.8-3.8-.4L8.5 5v6.6Z"/>`;

// ── DivIcon factories ────────────────────────────────────────────────
function createVotechIcon(color) {
  return L.divIcon({
    className: 'votech-marker',
    html: `<div class="marker-icon" style="background:${color}">
      <svg viewBox="0 0 16 16" width="15" height="15">${GEAR_SVG}</svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createCharterIcon(color) {
  return L.divIcon({
    className: 'charter-marker',
    html: `<div class="marker-icon marker-icon-sm" style="background:${color}">
      <svg viewBox="0 0 16 16" width="13" height="13">${BOOK_SVG}</svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ── Tooltip HTML (for district layer — uses bindTooltip) ─────────────
function buildDistrictTooltipHtml(name, closing) {
  if (closing) {
    const color = getColor(closing.statusType);
    const label = STATUS_LABELS[closing.statusType] || closing.statusType;
    return `
      <div style="font-family:'Inter',system-ui,sans-serif;min-width:200px">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#e6edf3">${name}</div>
        <div style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin-bottom:6px">${label}</div>
        <div style="font-size:12px;color:#c9d1d9;line-height:1.4;margin-top:4px">${closing.status}</div>
        ${closing.date ? `<div style="font-size:10px;color:#8b949e;margin-top:4px">${closing.date}</div>` : ''}
      </div>`;
  }
  return `
    <div style="font-family:'Inter',system-ui,sans-serif">
      <div style="font-weight:700;font-size:13px;color:#e6edf3">${name}</div>
      <div style="font-size:11px;color:#3fb950;margin-top:4px">No closings reported</div>
    </div>`;
}

// ── Tooltip JSX (for Marker tooltips — React component) ──────────────
function TooltipContent({ name, closing, tag }) {
  const color = closing ? getColor(closing.statusType) : null;
  const label = closing ? (STATUS_LABELS[closing.statusType] || closing.statusType) : null;
  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", minWidth: 200 }}>
      {tag && <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>{tag}</div>}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#e6edf3' }}>{name}</div>
      {closing ? (
        <>
          <div style={{
            display: 'inline-block', background: color, color: '#fff',
            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, marginBottom: 6,
          }}>{label}</div>
          <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.4, marginTop: 4 }}>
            {closing.status}
          </div>
          {closing.date && (
            <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{closing.date}</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 11, color: '#3fb950', marginTop: 4 }}>No closings reported</div>
      )}
    </div>
  );
}

// ── Helper: compute centroid of a GeoJSON polygon ────────────────────
function getFeatureCentroid(feature) {
  try {
    return L.geoJSON(feature).getBounds().getCenter();
  } catch {
    return null;
  }
}

// ── Helper: create custom pane once ──────────────────────────────────
function PaneSetup() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('votechBoundaryPane')) {
      map.createPane('votechBoundaryPane');
      map.getPane('votechBoundaryPane').style.zIndex = 450;
      map.getPane('votechBoundaryPane').style.pointerEvents = 'none';
    }
  }, [map]);
  return null;
}

// ── Helper: expose map instance to parent via ref ────────────────────
function MapBridge({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

// ── Helper: draw VoTech boundary on hover ────────────────────────────
function VotechBoundaryOverlay({ votechDistricts, hoveredVotech, closingsByVotech }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    // Remove previous boundary
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!hoveredVotech || !votechDistricts?.features) return;

    const feature = votechDistricts.features.find(
      f => f.properties.VOTECH === hoveredVotech,
    );
    if (!feature) return;

    const closing = (closingsByVotech || {})[hoveredVotech];
    const color = closing ? getColor(closing.statusType) : '#c9d1d9';

    layerRef.current = L.geoJSON(feature, {
      style: {
        fillColor: 'transparent',
        fillOpacity: 0,
        color,
        weight: 2.5,
        dashArray: '8, 5',
        opacity: 0.85,
      },
      interactive: false,
      pane: 'votechBoundaryPane',
    }).addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, hoveredVotech, votechDistricts, closingsByVotech]);

  return null;
}

// ── Main Component ───────────────────────────────────────────────────
const SchoolClosingsMap = forwardRef(({
  districts,
  closingsByDistrict,
  votechDistricts,
  closingsByVotech,
  charterSchools,
  closingsByCharter,
}, ref) => {
  const geoJsonRef = useRef(null);
  const internalMapRef = useRef(null);
  const [hoveredVotech, setHoveredVotech] = useState(null);

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, zoom = 13) {
      if (internalMapRef.current) {
        internalMapRef.current.flyTo([lat, lng], zoom, { duration: 1.2 });
      }
    },
  }));

  // ── Traditional Districts ──────────────────────────────────────────
  const styleDistrict = useCallback((feature) => {
    const closing = (closingsByDistrict || {})[feature.properties.NAME];
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

  const onEachDistrict = useCallback((feature, layer) => {
    const name    = feature.properties.NAME;
    const closing = (closingsByDistrict || {})[name];

    layer.bindTooltip(buildDistrictTooltipHtml(name, closing), {
      sticky: true, direction: 'auto', offset: [15, 0],
      opacity: 1, className: 'district-tooltip', interactive: false,
    });

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 3,
          fillOpacity: closing ? 0.65 : 0.2,
          color: closing ? getColor(closing.statusType) : '#8b949e',
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) l.bringToFront();
      },
      mouseout: (e) => {
        if (geoJsonRef.current) geoJsonRef.current.resetStyle(e.target);
      },
    });
  }, [closingsByDistrict]);

  // ── VoTech centroids ───────────────────────────────────────────────
  const votechMarkers = useMemo(() => {
    if (!votechDistricts?.features) return [];
    return votechDistricts.features
      .map(f => ({
        centroid: getFeatureCentroid(f),
        name:     f.properties.NAME,
        votech:   f.properties.VOTECH,
      }))
      .filter(d => d.centroid);
  }, [votechDistricts]);

  // ── Charter school points (deduplicated by name) ───────────────────
  const charterMarkers = useMemo(() => {
    if (!charterSchools?.features) return [];
    const seen = new Set();
    return charterSchools.features
      .filter(f => f.geometry?.type === 'Point' && f.properties?.SCHOOLNAME)
      .reduce((acc, f) => {
        const name = f.properties.SCHOOLNAME;
        if (seen.has(name)) return acc;
        seen.add(name);
        acc.push({
          lat:  f.geometry.coordinates[1],
          lng:  f.geometry.coordinates[0],
          name,
        });
        return acc;
      }, []);
  }, [charterSchools]);

  return (
    <MapContainer
      center={[39.05, -75.45]}
      zoom={9}
      minZoom={8}
      maxZoom={13}
      maxBounds={delawareBounds}
      maxBoundsViscosity={0.9}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <PaneSetup />
      <MapBridge mapRef={internalMapRef} />
      <VotechBoundaryOverlay
        votechDistricts={votechDistricts}
        hoveredVotech={hoveredVotech}
        closingsByVotech={closingsByVotech}
      />

      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />

      {/* Layer 1: Traditional district filled polygons (overlayPane z:400) */}
      {districts?.features && (
        <GeoJSON
          ref={geoJsonRef}
          data={districts}
          style={styleDistrict}
          onEachFeature={onEachDistrict}
        />
      )}

      {/* Layer 2: VoTech district markers — gear icon (markerPane z:600) */}
      {votechMarkers.map(({ centroid, name, votech }, i) => {
        const closing    = (closingsByVotech || {})[votech];
        const hasClosing = !!closing;
        const color      = hasClosing ? getColor(closing.statusType) : '#484f58';
        return (
          <Marker
            key={`votech-${i}`}
            position={[centroid.lat, centroid.lng]}
            icon={createVotechIcon(color)}
            eventHandlers={{
              mouseover: () => setHoveredVotech(votech),
              mouseout:  () => setHoveredVotech(null),
            }}
          >
            <Tooltip
              sticky direction="auto" offset={[16, 0]}
              opacity={1} className="district-tooltip"
            >
              <TooltipContent name={name} closing={closing} tag="VoTech District" />
            </Tooltip>
          </Marker>
        );
      })}

      {/* Layer 3: Charter school markers — book icon (markerPane z:600) */}
      {charterMarkers.map(({ lat, lng, name }, i) => {
        const closing    = (closingsByCharter || {})[name];
        const hasClosing = !!closing;
        const color      = hasClosing ? getColor(closing.statusType) : '#484f58';
        return (
          <Marker
            key={`charter-${i}`}
            position={[lat, lng]}
            icon={createCharterIcon(color)}
          >
            <Tooltip
              sticky direction="auto" offset={[14, 0]}
              opacity={1} className="district-tooltip"
            >
              <TooltipContent name={name} closing={closing} tag="Charter School" />
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
});

SchoolClosingsMap.displayName = 'SchoolClosingsMap';

export default SchoolClosingsMap;
