/* Typori syllabic-templates.js
 * Embedded template data so grids work without a server (file:// or offline).
 * JSON files in templates/syllabic-grid/ are the authoritative source;
 * these copies are kept in sync manually or via a build step.
 */
window.SYLLABIC_TEMPLATES = {

  odia: {
    name: "Odia Akshara",
    consonants: ["କ","ଖ","ଗ","ଘ","ଙ","ଚ","ଛ","ଜ","ଝ","ଞ","ଟ","ଠ","ଡ","ଢ","ଣ","ତ","ଥ","ଦ","ଧ","ନ","ପ","ଫ","ବ","ଭ","ମ","ଯ","ର","ଲ","ୱ","ଶ","ଷ","ସ","ହ","ଳ"],
    vowelSigns: [
      {label:"—",   sign:""},
      {label:"ା",   sign:"ା"},
      {label:"ି",   sign:"ି"},
      {label:"ୀ",   sign:"ୀ"},
      {label:"ୁ",   sign:"ୁ"},
      {label:"ୂ",   sign:"ୂ"},
      {label:"ୃ",   sign:"ୃ"},
      {label:"େ",   sign:"େ"},
      {label:"ୈ",   sign:"ୈ"},
      {label:"ୋ",   sign:"ୋ"},
      {label:"ୌ",   sign:"ୌ"},
      {label:"ଂ",   sign:"ଂ"},
      {label:"ଃ",   sign:"ଃ"},
      {label:"୍",   sign:"୍"}
    ]
  },

  devanagari: {
    name: "Devanagari Barakhadi",
    consonants: ["क","ख","ग","घ","ङ","च","छ","ज","झ","ञ","ट","ठ","ड","ढ","ण","त","थ","द","ध","न","प","फ","ब","भ","म","य","र","ल","व","श","ष","स","ह"],
    vowelSigns: [
      {label:"—",   sign:""},
      {label:"ā",   sign:"ा"},
      {label:"i",   sign:"ि"},
      {label:"ī",   sign:"ी"},
      {label:"u",   sign:"ु"},
      {label:"ū",   sign:"ू"},
      {label:"ṛ",   sign:"ृ"},
      {label:"e",   sign:"े"},
      {label:"ai",  sign:"ै"},
      {label:"o",   sign:"ो"},
      {label:"au",  sign:"ौ"},
      {label:"ṃ",   sign:"ं"},
      {label:"ḥ",   sign:"ः"},
      {label:"hal", sign:"्"}
    ]
  },

  bangla: {
    name: "Bangla Barakhadi",
    consonants: ["ক","খ","গ","ঘ","ঙ","চ","ছ","জ","ঝ","ঞ","ট","ঠ","ড","ঢ","ণ","ত","থ","দ","ধ","ন","প","ফ","ব","ভ","ম","য","র","ল","শ","ষ","স","হ","ড়","ঢ়","য়"],
    vowelSigns: [
      {label:"—",   sign:""},
      {label:"া",   sign:"া"},
      {label:"ি",   sign:"ি"},
      {label:"ী",   sign:"ী"},
      {label:"ু",   sign:"ু"},
      {label:"ূ",   sign:"ূ"},
      {label:"ৃ",   sign:"ৃ"},
      {label:"ে",   sign:"ে"},
      {label:"ৈ",   sign:"ৈ"},
      {label:"ো",   sign:"ো"},
      {label:"ৌ",   sign:"ৌ"},
      {label:"ং",   sign:"ং"},
      {label:"ঃ",   sign:"ঃ"},
      {label:"্",   sign:"্"}
    ]
  },

  tamil: {
    name: "Tamil Akshara",
    consonants: ["க","ங","ச","ஞ","ட","ண","த","ந","ப","ம","ய","ர","ல","வ","ழ","ள","ற","ன"],
    vowelSigns: [
      {label:"—",    sign:""},
      {label:"ā",    sign:"ா"},
      {label:"i",    sign:"ி"},
      {label:"ī",    sign:"ீ"},
      {label:"u",    sign:"ு"},
      {label:"ū",    sign:"ூ"},
      {label:"e",    sign:"ெ"},
      {label:"ē",    sign:"ே"},
      {label:"ai",   sign:"ை"},
      {label:"o",    sign:"ொ"},
      {label:"ō",    sign:"ோ"},
      {label:"au",   sign:"ௌ"},
      {label:"pulli",sign:"்"}
    ]
  },

  malayalam: {
    name: "Malayalam Akshara",
    consonants: ["ക","ഖ","ഗ","ഘ","ങ","ച","ഛ","ജ","ഝ","ഞ","ട","ഠ","ഡ","ഢ","ണ","ത","ഥ","ദ","ധ","ന","പ","ഫ","ബ","ഭ","മ","യ","ര","ല","വ","ശ","ഷ","സ","ഹ","ള","ഴ","റ"],
    vowelSigns: [
      {label:"—",  sign:""},
      {label:"ā",  sign:"ാ"},
      {label:"i",  sign:"ി"},
      {label:"ī",  sign:"ീ"},
      {label:"u",  sign:"ു"},
      {label:"ū",  sign:"ൂ"},
      {label:"ṛ",  sign:"ൃ"},
      {label:"e",  sign:"െ"},
      {label:"ē",  sign:"േ"},
      {label:"ai", sign:"ൈ"},
      {label:"o",  sign:"ൊ"},
      {label:"ō",  sign:"ോ"},
      {label:"au", sign:"ൌ"},
      {label:"ം",  sign:"ം"},
      {label:"ഃ",  sign:"ഃ"},
      {label:"്",  sign:"്"}
    ]
  },

  kannada: {
    name: "Kannada Akshara",
    consonants: ["ಕ","ಖ","ಗ","ಘ","ಙ","ಚ","ಛ","ಜ","ಝ","ಞ","ಟ","ಠ","ಡ","ಢ","ಣ","ತ","ಥ","ದ","ಧ","ನ","ಪ","ಫ","ಬ","ಭ","ಮ","ಯ","ರ","ಲ","ವ","ಶ","ಷ","ಸ","ಹ","ಳ"],
    vowelSigns: [
      {label:"—",  sign:""},
      {label:"ā",  sign:"ಾ"},
      {label:"i",  sign:"ಿ"},
      {label:"ī",  sign:"ೀ"},
      {label:"u",  sign:"ು"},
      {label:"ū",  sign:"ೂ"},
      {label:"ṛ",  sign:"ೃ"},
      {label:"e",  sign:"ೆ"},
      {label:"ē",  sign:"ೇ"},
      {label:"ai", sign:"ೈ"},
      {label:"o",  sign:"ೊ"},
      {label:"ō",  sign:"ೋ"},
      {label:"au", sign:"ೌ"},
      {label:"ಂ",  sign:"ಂ"},
      {label:"ಃ",  sign:"ಃ"},
      {label:"್",  sign:"್"}
    ]
  },

  latin: {
    name: "Latin CV Grid",
    consonants: ["b","c","d","f","g","h","j","k","l","m","n","p","r","s","t","v","w","y","z"],
    vowelSigns: [
      {label:"a", sign:"a"},
      {label:"e", sign:"e"},
      {label:"i", sign:"i"},
      {label:"o", sign:"o"},
      {label:"u", sign:"u"},
      {label:"ā", sign:"ā"},
      {label:"ē", sign:"ē"},
      {label:"ī", sign:"ī"},
      {label:"ō", sign:"ō"},
      {label:"ū", sign:"ū"}
    ]
  }

};
