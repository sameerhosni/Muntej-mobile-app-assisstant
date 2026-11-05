/** The language tag for dates and numbers: each screen keeps its own Arabic and English style; Hindi keeps Latin digits and the Gregorian calendar. */
export const intlTag = (lang: string, arTag: string, enTag: string) => (lang === 'ar' ? arTag : lang === 'hi' ? 'hi-IN-u-ca-gregory-nu-latn' : enTag);
