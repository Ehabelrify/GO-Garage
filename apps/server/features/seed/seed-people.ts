import { Rng, pad } from "./seed-core";
import { initialState } from "./seed-data";

export type Lang = "ar" | "en";
export type CategoryKey = "sedan" | "suv";

export interface StaffRec {
  id: string;
  email: string;
  name: string;
  role: "owner" | "branch-manager" | "receptionist" | "technician";
  branchIds: string[];
}

export const BRANCH_A = "branch-a";
export const BRANCH_B = "branch-b";
export const BRANCH_IDS = [BRANCH_A, BRANCH_B] as const;
export const OWNER = "demo-owner";

/** The demo technician account (auth/demo-auth.ts). The seed assigns it a realistic job set in its demo branch. */
export const DEMO_TECHNICIAN = "demo-technician";

/** demo-* accounts mirror auth/demo-auth.ts; the remaining staff are fictional seed memberships (not login accounts). Names are single-script and emails lowercase. */
export const STAFF: StaffRec[] = [
  { id: OWNER, email: "owner@noemail.com", name: "Sherif Abdallah", role: "owner", branchIds: [] },
  { id: "demo-manager", email: "manager@noemail.com", name: "Salma Nabil", role: "branch-manager", branchIds: [BRANCH_A] },
  { id: "demo-reception", email: "reception@noemail.com", name: "Karim Adel", role: "receptionist", branchIds: [BRANCH_A] },
  { id: DEMO_TECHNICIAN, email: "technician@noemail.com", name: "Youssef Samir", role: "technician", branchIds: [BRANCH_A] },
  { id: "seed-tech-a2", email: "mahmoud.adel@gostores.example", name: "Mahmoud Adel", role: "technician", branchIds: [BRANCH_A] },
  { id: "seed-tech-a3", email: "islam.fathy@gostores.example", name: "Islam Fathy", role: "technician", branchIds: [BRANCH_A] },
  { id: "seed-manager-b", email: "hany.ragab@gostores.example", name: "Hany Ragab", role: "branch-manager", branchIds: [BRANCH_B] },
  { id: "seed-reception-b", email: "nada.samir@gostores.example", name: "Nada Samir", role: "receptionist", branchIds: [BRANCH_B] },
  { id: "seed-tech-b1", email: "amr.salah@gostores.example", name: "Amr Salah", role: "technician", branchIds: [BRANCH_B] },
  { id: "seed-tech-b2", email: "mostafa.gamal@gostores.example", name: "Mostafa Gamal", role: "technician", branchIds: [BRANCH_B] },
];

export const staffFor = (branchId: string, role: StaffRec["role"]) =>
  STAFF.filter((member) => member.role === role && member.branchIds.includes(branchId));
export const managerOf = (branchId: string) => staffFor(branchId, "branch-manager")[0].id;
export const receptionOf = (branchId: string) => staffFor(branchId, "receptionist")[0].id;
export const techniciansOf = (branchId: string) => staffFor(branchId, "technician").map((member) => member.id);

const MALE: Array<[string, string]> = [
  ["أحمد", "Ahmed"], ["محمد", "Mohamed"], ["محمود", "Mahmoud"], ["مصطفى", "Mostafa"], ["عمر", "Omar"],
  ["يوسف", "Youssef"], ["كريم", "Karim"], ["طارق", "Tarek"], ["هشام", "Hisham"], ["خالد", "Khaled"],
  ["أمير", "Amir"], ["حسام", "Hossam"], ["وليد", "Walid"], ["شريف", "Sherif"], ["باسم", "Bassem"],
  ["إسلام", "Islam"], ["ياسر", "Yasser"], ["تامر", "Tamer"], ["ماجد", "Maged"], ["سامح", "Sameh"],
  ["عادل", "Adel"], ["رامي", "Ramy"], ["نادر", "Nader"], ["إيهاب", "Ehab"], ["ممدوح", "Mamdouh"], ["أسامة", "Osama"],
  ["صلاح", "Salah"], ["جمال", "Gamal"], ["هاني", "Hany"], ["عمرو", "Amr"],
];
const FEMALE: Array<[string, string]> = [
  ["مريم", "Mariam"], ["نور", "Nour"], ["سارة", "Sara"], ["هدى", "Hoda"], ["منى", "Mona"], ["دينا", "Dina"],
  ["ياسمين", "Yasmin"], ["ريم", "Reem"], ["نهى", "Noha"], ["آية", "Aya"], ["هبة", "Heba"], ["رنا", "Rana"],
  ["ليلى", "Layla"], ["أسماء", "Asmaa"], ["شيماء", "Shaimaa"], ["إيمان", "Eman"], ["سلمى", "Salma"], ["نادين", "Nadine"], ["رشا", "Rasha"], ["دعاء", "Doaa"],
];
const FAMILY: Array<[string, string]> = [
  ["حسن", "Hassan"], ["الشاذلي", "El-Shazly"], ["فوزي", "Fawzy"], ["السيد", "El-Sayed"], ["عبد الرحمن", "Abdelrahman"],
  ["منصور", "Mansour"], ["إبراهيم", "Ibrahim"], ["سليمان", "Soliman"], ["الجندي", "El-Gendy"], ["زكي", "Zaki"],
  ["الفخراني", "El-Fakhrany"], ["عبد الله", "Abdallah"], ["البنا", "El-Banna"], ["رشدي", "Roshdy"], ["لطفي", "Lotfy"],
  ["شعبان", "Shaaban"], ["الدسوقي", "El-Desouky"], ["حجازي", "Hegazy"],
  ["الحداد", "El-Haddad"], ["عفيفي", "Afifi"], ["النجار", "El-Naggar"], ["بدوي", "Badawy"], ["مرسي", "Morsy"], ["صبري", "Sabry"], ["عطية", "Atteya"], ["جاد", "Gad"],
];

export interface CarModel { make: string; model: string; category: CategoryKey }
export const CAR_MODELS: CarModel[] = [
  ...[
    ["Toyota", "Corolla"], ["Toyota", "Yaris"], ["Hyundai", "Elantra"], ["Hyundai", "Accent"], ["Kia", "Cerato"],
    ["Kia", "Picanto"], ["Nissan", "Sunny"], ["Nissan", "Sentra"], ["Chevrolet", "Optra"], ["Skoda", "Octavia"],
    ["Renault", "Logan"], ["Renault", "Megane"], ["MG", "5"], ["BYD", "F3"], ["Peugeot", "301"], ["Peugeot", "508"],
    ["BMW", "320i"], ["Mercedes-Benz", "C200"], ["Honda", "Civic"], ["Suzuki", "Dzire"], ["Fiat", "Tipo"],
    ["Mitsubishi", "Attrage"], ["Chery", "Arrizo 5"], ["Geely", "Emgrand"],
  ].map(([make, model]): CarModel => ({ make, model, category: "sedan" })),
  ...[
    ["Hyundai", "Tucson"], ["Hyundai", "Creta"], ["Kia", "Sportage"], ["Kia", "Sorento"], ["Nissan", "Qashqai"],
    ["Nissan", "Juke"], ["Toyota", "Fortuner"], ["Toyota", "RAV4"], ["Renault", "Duster"], ["MG", "ZS"], ["MG", "HS"],
    ["Chery", "Tiggo 7 Pro"], ["Chery", "Tiggo 8"], ["Jetour", "X70"], ["Jetour", "Dashing"], ["Haval", "Jolion"],
    ["BAIC", "X7"], ["Peugeot", "5008"], ["BYD", "Song Plus"], ["Skoda", "Kodiaq"], ["BMW", "X3"],
    ["Mercedes-Benz", "GLC"], ["Volkswagen", "Tiguan"], ["Mitsubishi", "Outlander"], ["Geely", "Coolray"], ["Honda", "CR-V"],
  ].map(([make, model]): CarModel => ({ make, model, category: "suv" })),
];
const modelOf = (make: string, model: string) => CAR_MODELS.find((item) => item.make === make && item.model === model)!;

const COLORS: Array<[string, string]> = [
  ["White", "أبيض"], ["Black", "أسود"], ["Silver", "فضي"], ["Gray", "رمادي"], ["Red", "أحمر"], ["Blue", "أزرق"], ["Beige", "بيج"],
];
/** Letters used on Egyptian plates. Plates here are random fictional combinations, not tied to real owners. */
const PLATE_LETTERS = ["أ", "ب", "ج", "د", "ر", "س", "ص", "ط", "ع", "ق", "ك", "ل", "م", "ن", "هـ", "و", "ى"];

export interface VehicleRec {
  id: string;
  customerId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  color: string;
  category: CategoryKey;
  categoryId: string;
}
export interface CustomerRec {
  id: string;
  name: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  phoneNormalized: string;
  language: Lang;
  vehicles: VehicleRec[];
  rich: boolean;
  branches: Set<string>;
  homeBranch: string;
}

export const categoryId = (category: CategoryKey) => `seed-cat-${category}`;

/** Hand-written profiles for the customers that carry a complete lifecycle (Customer-360 demos). */
const RICH: Array<{ first: [string, string]; father: [string, string]; family: [string, string]; lang: Lang; branch: string; cars: Array<{ make: string; model: string; year: number; plate: string; color: number }> }> = [
  { first: MALE[0], father: MALE[2], family: FAMILY[1], lang: "ar", branch: BRANCH_A, cars: [
    { make: "Toyota", model: "Corolla", year: 2022, plate: "أ ب ج 1234", color: 0 },
    { make: "Hyundai", model: "Tucson", year: 2023, plate: "س م ر 5678", color: 1 }] },
  { first: FEMALE[1], father: MALE[1], family: FAMILY[3], lang: "ar", branch: BRANCH_A, cars: [
    { make: "Kia", model: "Sportage", year: 2024, plate: "ك ن ل 2468", color: 2 }] },
  { first: MALE[4], father: MALE[9], family: FAMILY[2], lang: "en", branch: BRANCH_B, cars: [
    { make: "Hyundai", model: "Elantra", year: 2021, plate: "ع د ر 1357", color: 3 }] },
  { first: FEMALE[2], father: MALE[0], family: FAMILY[5], lang: "ar", branch: BRANCH_B, cars: [
    { make: "MG", model: "ZS", year: 2023, plate: "ص ط م 9021", color: 4 },
    { make: "BMW", model: "X3", year: 2022, plate: "و ق ل 3344", color: 1 }] },
  { first: MALE[6], father: MALE[0], family: FAMILY[6], lang: "en", branch: BRANCH_A, cars: [
    { make: "Skoda", model: "Octavia", year: 2023, plate: "ج ب أ 7788", color: 0 }] },
  { first: FEMALE[3], father: MALE[7], family: FAMILY[8], lang: "ar", branch: BRANCH_A, cars: [
    { make: "Toyota", model: "Yaris", year: 2023, plate: "ن ه ـ و 4455", color: 5 },
    { make: "Nissan", model: "Sunny", year: 2022, plate: "م ل ك 6677", color: 2 },
    { make: "Kia", model: "Picanto", year: 2024, plate: "ر س ع 8899", color: 4 }] },
  { first: MALE[7], father: MALE[3], family: FAMILY[4], lang: "ar", branch: BRANCH_B, cars: [
    { make: "Chery", model: "Tiggo 7 Pro", year: 2024, plate: "د ج ب 1122", color: 3 },
    { make: "BYD", model: "Song Plus", year: 2025, plate: "ط ص س 3366", color: 0 }] },
  { first: FEMALE[5], father: MALE[10], family: FAMILY[7], lang: "en", branch: BRANCH_A, cars: [
    { make: "Jetour", model: "X70", year: 2024, plate: "ق ع ن 5544", color: 1 }] },
];
export const RICH_COUNT = RICH.length;

export function buildPeople(rng: Rng, totalCustomers: number): CustomerRec[] {
  const customers: CustomerRec[] = [];
  // Plates of the legacy sample vehicles (seed-data.ts) are reserved so a generated plate can never collide with them.
  const platesUsed = new Set<string>(initialState.customers.flatMap((customer) => customer.vehicles.map((vehicle) => vehicle.plate)));
  const namesUsed = new Set<string>();
  let vehicleSeq = 0;
  const prefixes = ["100", "101", "102", "111", "112", "120", "122", "127"];

  const newPlate = () => {
    for (;;) {
      const letters = Array.from({ length: 3 }, () => rng.pick(PLATE_LETTERS)).join(" ");
      const plate = `${letters} ${rng.int(100, 9999)}`;
      if (!platesUsed.has(plate)) { platesUsed.add(plate); return plate; }
    }
  };
  const addVehicle = (customer: CustomerRec, make: string, model: string, year: number, plate: string, colorIndex: number) => {
    vehicleSeq += 1;
    const category = modelOf(make, model).category;
    const color = COLORS[colorIndex % COLORS.length];
    customer.vehicles.push({
      id: `seed-veh-${pad(vehicleSeq, 3)}`, customerId: customer.id, make, model, year, plate,
      color: customer.language === "ar" ? color[1] : color[0], category, categoryId: categoryId(category),
    });
  };

  for (let index = 0; index < totalCustomers; index++) {
    const rich = index < RICH.length ? RICH[index] : null;
    const male = rich ? !FEMALE.includes(rich.first) : rng.chance(0.72);
    let first = rich ? rich.first : rng.pick(male ? MALE : FEMALE);
    let father = rich ? rich.father : rng.pick(MALE);
    let family = rich ? rich.family : rng.pick(FAMILY);
    // One script per name, and no two customers share a name: re-draw on a repeated or self-repeating combination.
    for (let attempt = 0; !rich && (first[0] === father[0] || namesUsed.has(`${first[1]} ${father[1]} ${family[1]}`)) && attempt < 200; attempt++) {
      first = rng.pick(male ? MALE : FEMALE); father = rng.pick(MALE); family = rng.pick(FAMILY);
    }
    const language: Lang = rich ? rich.lang : rng.chance(0.76) ? "ar" : "en";
    const nameAr = `${first[0]} ${father[0]} ${family[0]}`;
    const nameEn = `${first[1]} ${father[1]} ${family[1]}`;
    namesUsed.add(nameEn);
    // Subscriber numbers stay in the fictional 000 block and never end in a round "00".
    let subscriber = 1101 + index * 17 + Math.floor((index * 17) / 100);
    if (subscriber % 100 === 0) subscriber += 1;
    const prefix = prefixes[index % prefixes.length];
    const customer: CustomerRec = {
      id: `seed-cust-${pad(index + 1, 3)}`,
      name: language === "ar" ? nameAr : nameEn,
      nameAr, nameEn,
      phone: `+20 ${prefix} 000 ${subscriber}`,
      phoneNormalized: `20${prefix}000${subscriber}`,
      language, vehicles: [], rich: Boolean(rich), branches: new Set(),
      homeBranch: rich ? rich.branch : rng.chance(0.58) ? BRANCH_A : BRANCH_B,
    };
    if (rich) {
      for (const car of rich.cars) { platesUsed.add(car.plate); addVehicle(customer, car.make, car.model, car.year, car.plate, car.color); }
    } else {
      const carCount = rng.weighted([[1, 70], [2, 24], [3, 6]] as const);
      for (let car = 0; car < carCount; car++) {
        const model = rng.pick(CAR_MODELS);
        addVehicle(customer, model.make, model.model, rng.int(2018, 2026), newPlate(), rng.int(0, COLORS.length - 1));
      }
    }
    customers.push(customer);
  }
  return customers;
}
