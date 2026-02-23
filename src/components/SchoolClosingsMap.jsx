import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

const SchoolClosingsMap = ({ schoolClosings }) => {
  return (
    <MapContainer center={[39.1668, -75.5244]} zoom={8} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {schoolClosings.map((closing, index) => (
        <Marker key={index} position={[closing.lat, closing.lon]}>
          <Popup>
            <strong>{closing.schoolName}</strong><br />
            Status: {closing.status}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default SchoolClosingsMap;
