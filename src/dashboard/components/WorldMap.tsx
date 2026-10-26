import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import type { LivePoint } from '../lib/api';
import { LiveGlobe, LiveMap2D } from './LiveGlobe';

const MapCanvas = lazy(() => import('./MapCanvas'));

/** Browsers without WebGL (and the test runner) get the canvas map instead of a black rectangle. */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** If the map chunk or the tiles fail, drop back to the hand-drawn map instead of an empty box. */
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The world map used by the Live view and the Overview geo card. Real vector tiles and a real
 * globe when the browser can draw them, our own canvas world when it cannot.
 */
export function WorldMap({
  points,
  mode,
  height,
}: {
  points: LivePoint[];
  mode: 'globe' | 'flat';
  height: number;
}) {
  const [webgl, setWebgl] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  const fallback =
    mode === 'globe' ? (
      <LiveGlobe points={points} height={height} />
    ) : (
      <LiveMap2D points={points} height={height} />
    );

  if (!webgl || failed) return fallback;

  return (
    <MapBoundary fallback={fallback}>
      <Suspense
        fallback={<div className="kl-map-skeleton animate-pulse" style={{ height }} aria-hidden="true" />}
      >
        <MapCanvas points={points} mode={mode} height={height} onFail={() => setFailed(true)} />
      </Suspense>
    </MapBoundary>
  );
}