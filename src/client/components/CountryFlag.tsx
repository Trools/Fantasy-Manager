interface CountryFlagProps {
  countryCode: string;
  countryName?: string;
  size?: "sm" | "md" | "lg";
}

export default function CountryFlag({
  countryCode,
  countryName,
  size = "md",
}: CountryFlagProps) {
  // Convert 3-letter FIFA code to 2-letter ISO for flag CDN
  const isoCode = fifaToIso(countryCode);
  const flagUrl = isoCode
    ? `https://flagcdn.com/w40/${isoCode.toLowerCase()}.png`
    : null;

  const sizeClasses = {
    sm: "w-5 h-3.5",
    md: "w-6 h-4",
    lg: "w-8 h-5",
  }[size];

  if (!flagUrl) {
    // Fallback: show 3-letter code in a chip
    return (
      <span
        className={`
          inline-flex items-center justify-center rounded
          bg-[--color-bg-elevated] text-[--color-text-secondary]
          text-[10px] font-medium px-1.5 py-0.5
        `}
        aria-label={countryName || countryCode}
      >
        {countryCode}
      </span>
    );
  }

  return (
    <img
      src={flagUrl}
      alt={countryName || countryCode}
      className={`${sizeClasses} rounded-sm object-cover`}
      loading="lazy"
    />
  );
}

// FIFA 3-letter to ISO 2-letter mapping (common countries)
function fifaToIso(fifa: string): string | null {
  const map: Record<string, string> = {
    ALB: "al", ALG: "dz", AND: "ad", ANG: "ao", ARG: "ar", ARM: "am",
    AUS: "au", AUT: "at", AZE: "az", BEL: "be", BIH: "ba", BOL: "bo",
    BRA: "br", BUL: "bg", CAN: "ca", CHI: "cl", CHN: "cn", CMR: "cm",
    COL: "co", CRC: "cr", CRO: "hr", CZE: "cz", DEN: "dk", DOM: "do",
    ECU: "ec", EGY: "eg", ENG: "gb-eng", ESP: "es", EST: "ee", FIN: "fi",
    FRA: "fr", GEO: "ge", GER: "de", GHA: "gh", GRE: "gr", GUA: "gt",
    HKG: "hk", HON: "hn", HUN: "hu", IDN: "id", IND: "in", IRL: "ie",
    IRN: "ir", IRQ: "iq", ISL: "is", ISR: "il", ITA: "it", JAM: "jm",
    JPN: "jp", JOR: "jo", KAZ: "kz", KEN: "ke", KOR: "kr", KSA: "sa",
    KUW: "kw", LTU: "lt", LVA: "lv", MAR: "ma", MEX: "mx", MKD: "mk",
    MLI: "ml", MLT: "mt", MNE: "me", NED: "nl", NGA: "ng", NIR: "gb-nir",
    NOR: "no", NZL: "nz", PAR: "py", PER: "pe", PHI: "ph", POL: "pl",
    POR: "pt", QAT: "qa", ROU: "ro", RSA: "za", RUS: "ru", SCO: "gb-sct",
    SEN: "sn", SLO: "si", SRB: "rs", SUI: "ch", SVK: "sk", SWE: "se",
    THA: "th", TUN: "tn", TUR: "tr", UAE: "ae", UKR: "ua", URU: "uy",
    USA: "us", UZB: "uz", VEN: "ve", VIE: "vn", WAL: "gb-wls",
  };
  return map[fifa] || null;
}
