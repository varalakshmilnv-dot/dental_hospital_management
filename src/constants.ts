export const CLINIC_INFO = {
  name: 'MED Rx DENTAL CENTRE',
  shortName: 'MED Rx Dental Centre',
  positioning: 'Modern Dentistry. Gentle Care. Confident Smiles.',
  address:
    '50, 1st Main, 4th Cross Road, Health Layout, Annapoorneshwari Nagar, Nagarbhavi, Bengaluru, Karnataka 560091, India',
  shortAddress: 'Health Layout, Annapoorneshwari Nagar, Nagarbhavi, Bengaluru 560091',
  phoneDisplay: '+91 99720 25712',
  phoneHref: 'tel:+919972025712',
  googleMapsUrl: 'https://maps.app.goo.gl/55i6BzuVbjkiz2Je6',
  whatsappPrefilledText:
    'Hello MED Rx Dental Centre, I would like to enquire about booking a dental appointment.',
  whatsappHref:
    'https://wa.me/919972025712?text=Hello%20MED%20Rx%20Dental%20Centre%2C%20I%20would%20like%20to%20enquire%20about%20booking%20a%20dental%20appointment.',
};

export const CLINIC_IMAGES = {
  heroSuite: '/src/assets/images/hero_dental_suite_1795623222201.jpg',
  reception: '/src/assets/images/clinic_reception_1795623221981.jpg',
  dentistPortrait: '/src/assets/images/dentist_portrait_1795623222992.jpg',
  consultation: '/src/assets/images/care_consultation_1795623224295.jpg',
  cosmeticSmile: '/src/assets/images/care_cosmetic_smile_1795623224335.jpg',
  restorativeCraft: '/src/assets/images/care_restorative_craft_1795623223921.jpg',
  familyCare: '/src/assets/images/care_family_dental_1795623224851.jpg',
};

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h24 = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h24) || Number.isNaN(m)) return hhmm;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getKolkataTodayString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
