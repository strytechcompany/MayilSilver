import { Dimensions, PixelRatio } from 'react-native';

const { width, height } = Dimensions.get('window');

const guidelineBaseWidth = 390;

export const screenWidth = width;
export const screenHeight = height;
export const isSmallScreen = width < 360;
export const horizontalPadding = width < 360 ? 12 : 16;
export const contentWidth = Math.min(width * 0.9, 480);
export const gridItemWidth = width * 0.4;

export const scaleSize = (size) => {
  const scaled = (width / guidelineBaseWidth) * size;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
};

export const moderateScale = (size, factor = 0.35) => {
  return Math.round(size + (scaleSize(size) - size) * factor);
};

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};
