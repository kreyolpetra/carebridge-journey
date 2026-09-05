/**
 * The patient's own screens, in the patient's own language.
 *
 * The care line has always been written per language — English, Jamaican
 * Patois, Haitian Kreyòl and Spanish, composed separately rather than machine
 * translated. The screens around it were not. Marlene read her messages in
 * Patois and everything else in English, which is an odd thing for a product
 * whose whole argument is reaching the people the official language of the
 * capital does not.
 *
 * Deliberately narrow. This covers the patient's own surfaces and nothing
 * else: a clinical console has its own vocabulary that clinicians here work in
 * every day, and translating "lawful basis" or "care tier" would help nobody
 * and introduce a way to be wrong about something that matters. The honest
 * scope is the half of the product a patient sees.
 *
 * Written per language rather than run through a translator, for the same
 * reason the messages are: a health instruction a patient half-understands is
 * worse than one they cannot read at all, because they will act on it.
 */
export type Lang = "en" | "jam" | "ht" | "es";

export const SUPPORTED: Lang[] = ["en", "jam", "ht", "es"];

/**
 * Keys are the English string, so a missing translation falls back to
 * something correct rather than to a key name leaking onto the screen.
 */
type Dict = Record<string, string>;

const jam: Dict = {
  // navigation
  // the tabs on the home screen
  Today: "Tiday",
  "Readings & medicines": "Mi readings an medicine",
  "My summary": "Mi summary",
  "See how my readings have moved": "See how mi readings a move",
  "My health": "Mi health",
  "My record": "Mi record",
  "My messages": "Mi message dem",
  "My appointments": "Mi appointment dem",
  "My privacy": "Mi privacy",
  "My health summary": "Mi health summary",
  Settings: "Settings",

  // home
  "Hello, {name}.": "Hello, {name}.",
  "Today's readings, your medications and what needs your attention.":
    "Today reading, yuh medicine, an wa need yuh attention.",
  "My risk level": "Mi risk level",
  "Blood pressure": "Blood pressure",
  "Blood sugar": "Blood sugar",
  "Medication adherence": "How yuh a tek yuh medicine",
  "Trend: rising": "It a get wors",
  "Last reading": "Last reading",

  // the reading card
  "Send a reading from home": "Send a reading from yuh yaad",
  "No clinic visit needed — your care team sees it straight away":
    "Yuh nuh haffi come a clinic — yuh care team see it right away",
  "Top number": "Top numba",
  "Bottom number": "Bottom numba",
  "Sugar (mmol/L)": "Sugar (mmol/L)",
  "Send to my care team": "Send it to mi care team",
  "Reading sent to your care team": "Di reading gone to yuh care team",
  "Enter a blood pressure or a sugar reading.": "Put in a blood pressure or a sugar reading.",

  // appointments
  "You will need an adult to bring you home and stay with you — you will not be able to travel on your own.":
    "Yuh wi need a big smaddy fi carry yuh home an stay wid yuh — yuh naa go can travel pon yuh own.",
  "is bringing you home. Nothing else to arrange.": "a carry yuh home. Nutten else fi arrange.",
};

const ht: Dict = {
  Today: "Jodi a",
  "Readings & medicines": "Mezi ak medikaman mwen",
  "My summary": "Rezime mwen",
  "See how my readings have moved": "Gade kijan mezi mwen yo deplase",
  "My health": "Sante mwen",
  "My record": "Dosye mwen",
  "My messages": "Mesaj mwen",
  "My appointments": "Randevou mwen",
  "My privacy": "Vi prive mwen",
  "My health summary": "Rezime sante mwen",
  Settings: "Paramèt",

  "Hello, {name}.": "Bonjou, {name}.",
  "Today's readings, your medications and what needs your attention.":
    "Mezi jodi a, medikaman ou, ak sa ki bezwen atansyon ou.",
  "My risk level": "Nivo risk mwen",
  "Blood pressure": "Tansyon",
  "Blood sugar": "Sik nan san",
  "Medication adherence": "Jan ou pran medikaman ou",
  "Trend: rising": "L ap monte",
  "Last reading": "Dènye mezi",

  "Send a reading from home": "Voye yon mezi depi lakay",
  "No clinic visit needed — your care team sees it straight away":
    "Ou pa bezwen vin nan klinik — ekip swen ou wè l touswit",
  "Top number": "Nimewo anwo",
  "Bottom number": "Nimewo anba",
  "Sugar (mmol/L)": "Sik (mmol/L)",
  "Send to my care team": "Voye bay ekip swen mwen",
  "Reading sent to your care team": "Mezi a rive nan ekip swen ou",
  "Enter a blood pressure or a sugar reading.": "Antre yon tansyon oswa yon mezi sik.",

  "You will need an adult to bring you home and stay with you — you will not be able to travel on your own.":
    "W ap bezwen yon granmoun pou mennen ou lakay epi rete avèk ou — ou p ap ka vwayaje pou kont ou.",
  "is bringing you home. Nothing else to arrange.":
    "ap mennen ou lakay. Pa gen lòt bagay pou regle.",
};

const es: Dict = {
  Today: "Hoy",
  "Readings & medicines": "Lecturas y medicinas",
  "My summary": "Mi resumen",
  "See how my readings have moved": "Ver cómo han cambiado mis lecturas",
  "My health": "Mi salud",
  "My record": "Mi historial",
  "My messages": "Mis mensajes",
  "My appointments": "Mis citas",
  "My privacy": "Mi privacidad",
  "My health summary": "Mi resumen de salud",
  Settings: "Ajustes",

  "Hello, {name}.": "Hola, {name}.",
  "Today's readings, your medications and what needs your attention.":
    "Sus mediciones de hoy, sus medicamentos y lo que necesita su atención.",
  "My risk level": "Mi nivel de riesgo",
  "Blood pressure": "Presión arterial",
  "Blood sugar": "Azúcar en sangre",
  "Medication adherence": "Cumplimiento del tratamiento",
  "Trend: rising": "En aumento",
  "Last reading": "Última medición",

  "Send a reading from home": "Enviar una medición desde casa",
  "No clinic visit needed — your care team sees it straight away":
    "No necesita venir a la clínica — su equipo lo ve enseguida",
  "Top number": "Número de arriba",
  "Bottom number": "Número de abajo",
  "Sugar (mmol/L)": "Azúcar (mmol/L)",
  "Send to my care team": "Enviar a mi equipo",
  "Reading sent to your care team": "Medición enviada a su equipo",
  "Enter a blood pressure or a sugar reading.":
    "Introduzca una presión arterial o una medición de azúcar.",

  "You will need an adult to bring you home and stay with you — you will not be able to travel on your own.":
    "Necesitará que un adulto le lleve a casa y se quede con usted — no podrá viajar solo.",
  "is bringing you home. Nothing else to arrange.":
    "le llevará a casa. No hay nada más que organizar.",
};

const DICTS: Record<Lang, Dict> = { en: {}, jam, ht, es };

/**
 * Translate, with interpolation for the one or two strings that carry a name.
 *
 * An unknown language or a missing key returns the English, which is the right
 * failure: a patient reading one line in the wrong language still understands
 * the screen, where a key name or an empty string tells them nothing.
 */
export function translate(
  lang: string | null | undefined,
  key: string,
  vars?: Record<string, string>,
) {
  const dict = DICTS[(lang as Lang) ?? "en"] ?? {};
  let out = dict[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}

/** How complete each language is, for the honesty note on the settings screen. */
export function coverage(lang: Lang) {
  const total = Object.keys(jam).length;
  const have = Object.keys(DICTS[lang] ?? {}).length;
  return lang === "en" ? 1 : have / total;
}
