import React from 'react';

export function Button() {
  return (
    <button
      style={{ color: '#ff0000', padding: '8px' }}
      className="button"
    >
      Click me
    </button>
  );
}

export function Card() {
  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '4px' }}>
      Hello
    </div>
  );
}
