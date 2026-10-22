import { createContext, useContext } from 'react';
import { DEFAULT_FEATURES, LOOK_DEFAULT } from './features.js';

// Saved feature switches + the look in force, provided by App to every screen.
export const FeatureContext = createContext({ features: DEFAULT_FEATURES, look: LOOK_DEFAULT });

export const useFeatures = () => useContext(FeatureContext);
export const useFeature = (id) => useContext(FeatureContext).features[id] !== false;
export const useLook = () => useContext(FeatureContext).look;

/** Renders its children only while the feature's switch is on. */
export function Gate({ id, children, fallback = null }) {
  return useFeature(id) ? children : fallback;
}
