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
  const registerPage = await fetch(BASE + "/register");
  ok(registerPage.status === 200, "صفحة /register تعمل (عام)", registerPage.status);
  const forgotPage = await fetch(BASE + "/forgot-password");
  ok(forgotPage.status === 200, "صفحة /forgot-password تعمل (عام)", forgotPage.status);
  const resetPage = await fetch(BASE + "/reset-password");
  ok(resetPage.status === 200, "صفحة /reset-password تعمل (عام)", resetPage.status);
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
  console.log("\n[5] الصلاحيات (دور موظف employee)");
  const staff = await call("POST", "/api/v1/users", A, {
    name: "موظف أ",
    email: "staff-a@test.dz",
    phone: "",
    role: "employee",
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
  ok(staffWrite.status === 403, "موظف بلا customers.manage → 403", staffWrite.status);
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
      owner: ["dashboard.view", "dashboard.manage"],
      admin: ["dashboard.view", "dashboard.manage"],
      manager: [],
      employee: [],
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

  // الموظف لا يمسّ مصفوفة الصلاحيات إطلاقًا
  const staffMatrix = await call("PUT", "/api/settings", S, {
    rolePermissions: { owner: [], admin: [], manager: [], employee: [] },
  });
  ok(staffMatrix.status === 403, "موظف يعدّل مصفوفة الصلاحيات → 403", staffMatrix.status);

  const permsUpdate = await call("PUT", "/api/settings", A, {
    rolePermissions: { owner: ["x.view"], admin: ["x.view"], manager: [], employee: [] },
  });
  ok(permsUpdate.status === 200, "المالك يحدّث مصفوفة الصلاحيات → 200", permsUpdate.status);
  // إعادة الصلاحيات الافتراضية قبل الاختبارات الأخرى
  await pg.query(`UPDATE "Organization" SET "rolePermissions" = NULL WHERE id = (SELECT id FROM "Organization" WHERE name = 'مؤسسة أ')`);

  // منح موظف صلاحية إضافة عملاء ثم سحبها (الممنوحة عبر المصفوفة)
  const grantEmp = await call("PUT", "/api/settings", A, {
    rolePermissions: {
      owner: ["dashboard.view"],
      admin: ["dashboard.view"],
      manager: ["sales.view"],
      employee: ["customers.view", "customers.manage", "sales.view", "sales.manage"],
    },
  });
  ok(grantEmp.status === 200, "منح موظف customers.manage → 200", grantEmp.status);
  const grantedWrite = await call("POST", "/api/v1/customers", S, { name: "عميل بمقتضى منح" });
  ok(grantedWrite.status === 201, "موظف يضيف عميل بعد المنح → 201", grantedWrite.status);
  await pg.query(`UPDATE "Organization" SET "rolePermissions" = NULL WHERE id = (SELECT id FROM "Organization" WHERE name = 'مؤسسة أ')`);
  const revokedWrite = await call("POST", "/api/v1/customers", S, { name: "محاولة بعد السحب" });
  ok(revokedWrite.status === 403, "سحب المنح يعيد المنع → 403", revokedWrite.status);

  // حذف الحساب الحالي محظور
  const deleteSelf = await call("DELETE", `/api/v1/users/${setup.json.data.user.id}`, A);
  ok(deleteSelf.status === 400, "حذف الحساب الحالي → 400", deleteSelf.status);

  /* ---------- 8) تسجيل الخروج ---------- */
  console.log("\n[8] تسجيل الخروج");
  const logout = await call("POST", "/api/auth/logout", A);
  ok(logout.status === 200, "تسجيل الخروج → 200");
  const afterLogout = await fetch(BASE + "/dashboard", { redirect: "manual", headers: { cookie: "" } });
  ok(afterLogout.status >= 300, "بعد الخروج: /dashboard يحوّل", afterLogout.status);

  /* ---------- 9) تسجيل حساب جديد + استعادة كلمة المرور ---------- */
  console.log("\n[9] التسجيل والاستعادة وإدارة الجلسات");

  // تسجيل: تحقق من المدخلات
  const weakRegister = await call("POST", "/api/auth/register", null, {
    organizationName: "مؤسسة ضعيفة",
    name: "مستخدم ضعيف",
    email: "weak@test.dz",
    password: "123",
  });
  ok(weakRegister.status === 400, "كلمة مرور قصيرة عند التسجيل → 400", weakRegister.status);
  ok(
    weakRegister.json?.error?.code === "VALIDATION_ERROR" && !!weakRegister.json?.error?.details,
    "تفاصيل أخطاء حقول التسجيل مُعادة",
    weakRegister.json,
  );

  // تسجيل: إنشاء مؤسسة جديدة + مستخدم owner + جلسة
  const registerC = await call("POST", "/api/auth/register", null, {
    organizationName: "مؤسسة ج",
    name: "مالك ج",
    email: "owner-c@test.dz",
    password: "password123",
  });
  ok(registerC.status === 201, "تسجيل حساب جديد → 201 (مؤسسة جديدة)", registerC.status);
  const C = registerC.cookie!;
  ok(
    registerC.json?.data?.user?.role === "owner",
    "مستخدم التسجيل له دور owner",
    registerC.json?.data?.user,
  );
  const meC = await call("GET", "/api/auth/me", C);
  ok(meC.status === 200 && meC.json?.data?.user?.role === "owner", "جلسة المالك صالحة → owner", meC.json);

  // تسجيل: بريد مسجّل مسبقًا
  const dupRegister = await call("POST", "/api/auth/register", null, {
    organizationName: "مؤسسة مكررة",
    name: "مستخدم مكرر",
    email: "owner-c@test.dz",
    password: "password123",
  });
  ok(dupRegister.status === 409, "بريد مسجّل بالفعل → 409", dupRegister.status);

  // عزل: مؤسسة ج لا ترى بيانات مؤسسة أ
  const cCustomers = await call("GET", "/api/v1/customers", C);
  ok(
    cCustomers.status === 200 && cCustomers.json.data.length === 0,
    "ج لا ترى عملاء أ",
    cCustomers.json.data.length,
  );

  // استعادة: رد موحّد للبريد غير الموجود (لا كشف الحسابات)
  const forgotGhost = await call("POST", "/api/auth/forgot-password", null, {
    email: "ghost@test.dz",
  });
  ok(
    forgotGhost.status === 200 && !forgotGhost.json?.data?.debugToken,
    "بريد غير مسجّل → 200 موحّد بلا رمز",
    forgotGhost.json,
  );

  // استعادة: بريد صحيح → رمز مؤقت (وضع التطوير بدون بريد)
  const forgotC = await call("POST", "/api/auth/forgot-password", null, {
    email: "owner-c@test.dz",
  });
  ok(forgotC.status === 200, "طلب استعادة → 200", forgotC.status);
  const resetToken = forgotC.json?.data?.debugToken;
  ok(typeof resetToken === "string" && resetToken.length >= 10, "رمز الاستعادة صدر", resetToken);

  const badReset = await call("POST", "/api/auth/reset-password", null, {
    token: "x".repeat(20),
    password: "password456",
  });
  ok(badReset.status === 400, "رمز خاطئ → 400", badReset.status);

  const meBefore = await call("GET", "/api/auth/me", C);
  ok(meBefore.status === 200, "الجلسة تعمل قبل إعادة التعيين", meBefore.status);

  const resetC = await call("POST", "/api/auth/reset-password", null, {
    token: resetToken,
    password: "password456",
  });
  ok(resetC.status === 200, "إعادة التعيين → 200", resetC.status);

  // إدارة الجلسات: كل الجلسات القديمة تُبطل فورًا
  const meAfter = await call("GET", "/api/auth/me", C);
  ok(meAfter.status === 401, "الجلسة القديمة أُبطالت بعد التغيير → 401", meAfter.status);

  const oldPassLogin = await call("POST", "/api/auth/login", null, {
    email: "owner-c@test.dz",
    password: "password123",
  });
  ok(oldPassLogin.status === 401, "كلمة المرور القديمة بعد التغيير → 401", oldPassLogin.status);

  const newPassLogin = await call("POST", "/api/auth/login", null, {
    email: "owner-c@test.dz",
    password: "password456",
  });
  ok(newPassLogin.status === 200, "الدخول بالكلمة الجديدة → 200", newPassLogin.status);
  const C2 = newPassLogin.cookie!;

  const reuseToken = await call("POST", "/api/auth/reset-password", null, {
    token: resetToken,
    password: "password789",
  });
  ok(reuseToken.status === 400, "رمز الاستعادة لا يُستخدم مرتين → 400", reuseToken.status);

  // تسلسل الأدوار: المدير لا يمسّ المالك ولا يمنح دور المالك
  const adminC = await call("POST", "/api/v1/users", C2, {
    name: "مدير ج",
    email: "admin-c@test.dz",
    phone: "",
    role: "admin",
    status: "active",
  });
  ok(adminC.status === 201, "المالك ينشئ مديرًا → 201", adminC.status);
  const adminCId = adminC.json.data.id;
  await pg.query(`UPDATE "User" SET "passwordHash" = $1 WHERE id = $2`, [
    hashPassword("adminpass123"),
    adminCId,
  ]);
  const loginAdminC = await call("POST", "/api/auth/login", null, {
    email: "admin-c@test.dz",
    password: "adminpass123",
  });
  ok(loginAdminC.status === 200, "دخول المدير → 200", loginAdminC.status);
  const AC = loginAdminC.cookie!;

  const demoteOwner = await call(
    "PATCH",
    `/api/v1/users/${registerC.json.data.user.id}`,
    AC,
    { role: "employee" },
  );
  ok(demoteOwner.status === 403, "مدير لا يغيّر دور المالك → 403", demoteOwner.status);

  const grantOwner = await call("POST", "/api/v1/users", AC, {
    name: "محاولة مالك",
    email: "evil-owner@test.dz",
    phone: "",
    role: "owner",
    status: "active",
  });
  ok(grantOwner.status === 403, "مدير لا يمنح دور المالك → 403", grantOwner.status);

  const deleteOwner = await call("DELETE", `/api/v1/users/${registerC.json.data.user.id}`, AC);
  ok(deleteOwner.status === 403, "مدير لا يحذف حساب المالك → 403", deleteOwner.status);

  await pg.end();

  console.log(`\n════════ النتيجة: ${passed} نجح / ${failed} فشل ════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
