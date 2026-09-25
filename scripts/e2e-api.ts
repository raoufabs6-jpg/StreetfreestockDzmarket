/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
// سكربت اختبار تكاملي — أنواع مرنة عن قصد لتسهيل فحص ردود JSON.
// اختبار تكامل API الشامل (يتطلب خادمًا يعملًا + قاعدة اختبار):
//   1) DATABASE_URL يشير لقاعدة بيانات اختبار (اسمها يحتوي "test")
//   2) شغّل الخادم: NEXT_PUBLIC_DATA_PROVIDER=api AUTH_SECRET=... DATABASE_URL=... npm run dev
//   3) npm run test:api
// يفحص: حماية الصفحات، التهيئة، التحقق من المدخلات، الصلاحيات،
//       و⚠️ عزل المؤسسات (الأهم). يُنشئ بيانات اختبار ثم يستعملها فقط.
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// ⚠️ حماية: لا يعمل الاختبار إلا على قاعدة بيانات اختبار (اسمها يحتوي "test")
if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
  console.error('مرّر DATABASE_URL يحتوي "test" لتشغيل اختبار العزل (حماية من التنفيذ على إنتاج).');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : "");
  }
}

type Res = { status: number; json: any; cookie: string | null };

async function call(
  method: string,
  path: string,
  cookie: string | null,
  body?: unknown,
): Promise<Res> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  const setCookie = res.headers.get("set-cookie");
  const cookie2 = setCookie ? setCookie.split(";")[0] : cookie;
  return { status: res.status, json, cookie: cookie2 };
}

const hashPassword = (password: string) => {
  const { scryptSync, randomBytes } = require("crypto");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};

async function main() {
  /* ---------- 1) حماية الصفحات ---------- */
  console.log("\n[1] حماية الصفحات والجلسة");
  const home = await fetch(BASE + "/", { redirect: "manual" });
  ok(home.status >= 300 && home.status < 400, "الصفحة الرئيسية تحوّل لتسجيل الدخول", home.status);
  const loginPage = await fetch(BASE + "/login");
  ok(loginPage.status === 200, "صفحة /login تعمل");
  const noCookie = await call("GET", "/api/v1/customers", null);
  ok(noCookie.status === 401, "API بدون جلسة → 401", noCookie.status);

  /* ---------- 2) التهيئة setup ---------- */
  console.log("\n[2] إنشاء أول مؤسسة (Setup)");
  const setup = await call("POST", "/api/auth/setup", null, {
    organizationName: "مؤسسة أ",
    name: "مدير أ",
    email: "admin-a@test.dz",
    password: "password123",
  });
  ok(setup.status === 201, "إنشاء مؤسسة أ → 201", setup);
  const cookieA = setup.cookie!;
  ok(!!cookieA, "كوكي جلسة أ صدر");

  const setupAgain = await call("POST", "/api/auth/setup", null, {
    organizationName: "مؤسسة تكرار",
    name: "x",
    email: "x@test.dz",
    password: "password123",
  });
  ok(setupAgain.status === 409, "التهيئة مرة واحدة فقط → 409", setupAgain.status);

  const badLogin = await call("POST", "/api/auth/login", null, {
    email: "admin-a@test.dz",
    password: "wrong",
  });
  ok(badLogin.status === 401, "كلمة خاطئة → 401", badLogin.status);

  const loginA = await call("POST", "/api/auth/login", null, {
    email: "admin-a@test.dz",
    password: "password123",
  });
  ok(loginA.status === 200, "تسجيل الدخول بحساب أ → 200", loginA.status);
  const A = loginA.cookie!;

  /* ---------- 3) التحقق من المدخلات ---------- */
  console.log("\n[3] التحقق من المدخلات (Validation)");
  const badCustomer = await call("POST", "/api/v1/customers", A, { name: "" });
  ok(badCustomer.status === 400, "عميل بلا اسم → 400", badCustomer.status);
  ok(
    badCustomer.json?.error?.code === "VALIDATION_ERROR" && badCustomer.json?.error?.details,
    "تفاصيل أخطاء الحقول مُعادة",
    badCustomer.json,
  );
  const badDate = await call("POST", "/api/v1/expenses", A, {
    date: "25/09/2026",
    category: "rent",
    amount: 100,
    description: "x",
    paymentMethod: "cash",
  });
  ok(badDate.status === 400, "تاريخ بصيغة خاطئة → 400", badDate.status);

  /* ---------- 4) بيانات مؤسسة أ ---------- */
  console.log("\n[4] إنشاء بيانات لمؤسسة أ");
  const cust = await call("POST", "/api/v1/customers", A, {
    name: "عميل أ",
    email: "c@a.dz",
    phone: "0550112233",
    address: "",
    note: "",
  });
  ok(cust.status === 201, "عميل → 201", cust.json);
  const custA = cust.json.data;

  const prod = await call("POST", "/api/v1/products", A, {
    name: "منتج أ",
    sku: "A-1",
    category: "إلكترونيات",
    unit: "piece",
    costPrice: 60,
    unitPrice: 100,
    stock: 10,
    minStock: 2,
    description: "",
  });
  ok(prod.status === 201, "منتج → 201", prod.json);
  const prodA = prod.json?.data;
  ok(prodA?.stock === 10 && prodA?.category === "إلكترونيات", "مخزون وفئة مُعادان بشكل مُشتق", prodA);

  const catList = await call("GET", "/api/v1/categories", A);
  ok(catList.status === 200 && catList.json.data.some((c: any) => c.name === "إلكترونيات"), "فئة أُنشئت تلقائيًا");

  const sale = await call("POST", "/api/v1/sales", A, {
    number: "SAL-0001",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 2, price: 100 }],
    discount: 10,
    paymentStatus: "paid",
    note: "",
  });
  ok(sale.status === 201 && sale.json.data.items.length === 1, "بيع مع بنود → 201", sale.json);

  const dupSale = await call("POST", "/api/v1/sales", A, {
    number: "SAL-0001",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 1, price: 100 }],
    discount: 0,
    paymentStatus: "unpaid",
    note: "",
  });
  ok(dupSale.status === 409, "رقم بيع مكرر → 409", dupSale.status);

  // حركة مخزون
  const mov = await call("POST", "/api/v1/movements", A, {
    productId: prodA.id,
    type: "out",
    quantity: 3,
    date: "2026-09-25",
    note: "بيع",
  });
  ok(mov.status === 201, "سحب مخزون → 201", mov.status);
  const prodAfter = await call("GET", `/api/v1/products/${prodA.id}`, A);
  ok(prodAfter.json?.data?.stock === 7, "المخزون نقص لـ 7", prodAfter.json?.data?.stock);

  const movTooMuch = await call("POST", "/api/v1/movements", A, {
    productId: prodA.id,
    type: "out",
    quantity: 999,
    date: "2026-09-25",
    note: "",
  });
  ok(movTooMuch.status === 400, "سحب أكثر من المتوفر → 400", movTooMuch.status);

  /* ---------- 5) المستخدمون والصلاحيات ---------- */
  console.log("\n[5] الصلاحيات (دور موظف)");
  const staff = await call("POST", "/api/v1/users", A, {
    name: "موظف أ",
    email: "staff-a@test.dz",
    phone: "",
    role: "staff",
    status: "active",
  });
  ok(staff.status === 201, "إنشاء موظف → 201", staff.json);
  const staffId = staff.json.data.id;

  // إعطاء كلمة مرور للموظف مباشرة (لا يوجد حقل كلمة مرور في واجهة CRUD)
  const { Client } = require(process.cwd() + "/node_modules/pg");
  const pg = new Client({
    host: "127.0.0.1",
    port: 54329,
    user: "akma",
    database: "akma_test",
  });
  await pg.connect();
  await pg.query("UPDATE \"User\" SET \"passwordHash\" = $1 WHERE id = $2", [
    hashPassword("staffpass123"),
    staffId,
  ]);

  const loginStaff = await call("POST", "/api/auth/login", null, {
    email: "staff-a@test.dz",
    password: "staffpass123",
  });
  ok(loginStaff.status === 200, "دخول الموظف → 200", loginStaff.status);
  const S = loginStaff.cookie!;

  const staffRead = await call("GET", "/api/v1/customers", S);
  ok(staffRead.status === 200, "موظف يقرأ العملاء (view) → 200", staffRead.status);
  const staffWrite = await call("POST", "/api/v1/customers", S, { name: "محاولة" });
  ok(staffWrite.status === 403, "موظف يضيف عميل (manage) → 403", staffWrite.status);
  const staffUsers = await call("GET", "/api/v1/users", S);
  ok(staffUsers.status === 403, "موظف بلا صلاحية users.view → 403", staffUsers.status);

  // المستخدم لا يرى hash في البيانات أبدًا
  const usersList = await call("GET", "/api/v1/users", A);
  const leakHash = JSON.stringify(usersList.json).includes("passwordHash") ||
    JSON.stringify(usersList.json).includes("scrypt");
  ok(!leakHash, "لا يظهر passwordHash في ردود API");

  /* ---------- 6) مؤسسة ب — العزل ---------- */
  console.log("\n[6] عزل المؤسسات (مؤسسة ب)");
  const { randomUUID } = require("crypto");
  const orgBId = randomUUID();
  const userBId = randomUUID();
  await pg.query(
    `INSERT INTO "Organization" (id, name, "rolePermissions", "updatedAt") VALUES ($1, $2, $3, now())`,
    [orgBId, "مؤسسة ب", JSON.stringify({
      admin: ["dashboard.view", "dashboard.manage"],
      manager: [],
      staff: [],
    })],
  );
  await pg.query(
    `INSERT INTO "User" (id, "organizationId", name, email, role, status, "passwordHash", "updatedAt")
     VALUES ($1, $2, 'مدير ب', 'admin-b@test.dz', 'admin', 'active', $3, now())`,
    [userBId, orgBId, hashPassword("password123")],
  );

  const loginB = await call("POST", "/api/auth/login", null, {
    email: "admin-b@test.dz",
    password: "password123",
  });
  ok(loginB.status === 200, "دخول مؤسسة ب → 200", loginB.status);
  const B = loginB.cookie!;

  const bCustomers = await call("GET", "/api/v1/customers", B);
  ok(bCustomers.status === 200 && bCustomers.json.data.length === 0, "ب لا ترى عملاء أ", bCustomers.json);

  const bReadA = await call("GET", `/api/v1/customers/${custA.id}`, B);
  ok(bReadA.status === 404, "ب تقرأ عميل أ مباشرة → 404", bReadA.status);

  const bPatchA = await call("PATCH", `/api/v1/customers/${custA.id}`, B, { name: "اختراق" });
  ok(bPatchA.status === 404, "ب تعدّل عميل أ → 404", bPatchA.status);

  const bDeleteA = await call("DELETE", `/api/v1/customers/${custA.id}`, B);
  ok(bDeleteA.status === 404, "ب تحذف عميل أ → 404", bDeleteA.status);

  const bSaleA = await call("POST", "/api/v1/sales", B, {
    number: "SAL-9999",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 1, price: 100 }],
    discount: 0,
    paymentStatus: "paid",
    note: "",
  });
  ok(bSaleA.status === 400, "ب تبيع لعميل أ (علاقة عابرة) → 400", bSaleA.status);

  const bSaleNoProduct = await call("POST", "/api/v1/sales", B, {
    number: "SAL-9998",
    date: "2026-09-25",
    customerId: "00000000-0000-0000-0000-000000000000",
    items: [{ productId: "00000000-0000-0000-0000-000000000000", quantity: 1, price: 1 }],
    discount: 0,
    paymentStatus: "paid",
    note: "",
  });
  ok(bSaleNoProduct.status === 400, "بيع بمعطيات غير موجودة → 400", bSaleNoProduct.status);

  // ب تنشئ عميلها — لا يظهر لأ
  const custB = await call("POST", "/api/v1/customers", B, { name: "عميل ب", phone: "", email: "", address: "", note: "" });
  ok(custB.status === 201, "ب تنشئ عميلها → 201");
  const aCustomers = await call("GET", "/api/v1/customers", A);
  const aSeesB = aCustomers.json.data.some((c: any) => c.name === "عميل ب");
  ok(!aSeesB, "أ لا ترى عملاء ب", aCustomers.json.data.length);

  // إعدادات كل مؤسسة مستقلة
  const settingsB = await call("GET", "/api/settings", B);
  ok(settingsB.json?.data?.businessName !== "مؤسسة أ", "إعدادات ب مستقلة", settingsB.json?.data);
  const switchToForeign = await call("PUT", "/api/settings", B, { currentUserId: staffId });
  ok(switchToForeign.status === 403, "تبديل لمستخدم خارج المؤسسة → 403", switchToForeign.status);

  /* ---------- 7) صلاحيات الإعدادات ---------- */
  console.log("\n[7] إعدادات وصلاحيات");
  const staffPerms = await call("PUT", "/api/settings", S, { businessName: "هاك" });
  ok(staffPerms.status === 403, "موظف يعدّل إعدادات المنشأة → 403", staffPerms.status);
  const permsUpdate = await call("PUT", "/api/settings", A, {
    rolePermissions: { admin: ["x.view"], manager: [], staff: [] },
  });
  ok(permsUpdate.status === 200, "مدير النظام يحدّث مصفوفة الصلاحيات → 200", permsUpdate.status);
  // إعادة الصلاحيات الافتراضية قبل الاختبارات الأخرى
  await pg.query(`UPDATE "Organization" SET "rolePermissions" = NULL WHERE id = (SELECT id FROM "Organization" WHERE name = 'مؤسسة أ')`);

  // حذف الحساب الحالي محظور
  const deleteSelf = await call("DELETE", `/api/v1/users/${setup.json.data.user.id}`, A);
  ok(deleteSelf.status === 400, "حذف الحساب الحالي → 400", deleteSelf.status);

  /* ---------- 8) تسجيل الخروج ---------- */
  console.log("\n[8] تسجيل الخروج");
  const logout = await call("POST", "/api/auth/logout", A);
  ok(logout.status === 200, "تسجيل الخروج → 200");
  const afterLogout = await fetch(BASE + "/dashboard", { redirect: "manual", headers: { cookie: "" } });
  ok(afterLogout.status >= 300, "بعد الخروج: /dashboard يحوّل", afterLogout.status);

  await pg.end();

  console.log(`\n════════ النتيجة: ${passed} نجح / ${failed} فشل ════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
