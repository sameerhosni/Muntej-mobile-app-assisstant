// The Muntej brand from the client presentation: the symbol (dots → rising arrow) and the "Muntej" wordmark.
// Image files in assets/brand (cut from the deck); the wordmark is always Latin, so it never flips in RTL.
import { Image, View, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "@/theme/tokens";

const SYMBOL = require("../../../assets/brand/symbol.png");
const WORDMARK = require("../../../assets/brand/wordmark.png");
const WORDMARK_WHITE = require("../../../assets/brand/wordmark-white.png");

/** symbol.png is 384 × 272 */
const SYMBOL_RATIO = 272 / 384;
/** wordmark.png is 480 × 161 */
const WORDMARK_RATIO = 161 / 480;

/** The arrow mark. `size` = width in px. */
export function BrandSymbol({
  size = 28,
  style,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={SYMBOL}
      accessibilityIgnoresInvertColors
      style={[{ width: size, height: Math.round(size * SYMBOL_RATIO) }, style]}
      resizeMode="contain"
    />
  );
}

/** "Muntej" in the brand lettering. `width` in px; `white` on dark headers. */
export function BrandWordmark({
  width = 96,
  variant = "dark",
  style,
}: {
  width?: number;
  variant?: "dark" | "white";
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={variant === "white" ? WORDMARK_WHITE : WORDMARK}
      accessibilityRole="image"
      accessibilityLabel="Muntej"
      style={[{ width, height: Math.round(width * WORDMARK_RATIO) }, style]}
      resizeMode="contain"
    />
  );
}

/** The symbol on a small white rounded square: its colours need a light ground, so this is how it sits on dark headers. */
export function BrandChip({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandSymbol size={Math.round(size * 0.74)} />
    </View>
  );
}
