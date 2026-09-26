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

  // صفحة تفاصيل العميل (CRM)
  const detailsPage = await fetch(`${BASE}/customers/${custA.id}`, {
    headers: { cookie: A },
    redirect: "manual",
  });
  ok(detailsPage.status === 200, "صفحة تفاصيل العميل → 200", detailsPage.status);
  const detailsNoSession = await fetch(`${BASE}/customers/${custA.id}`, { redirect: "manual" });
  ok(
    detailsNoSession.status >= 300 && detailsNoSession.status < 400,
    "تفاصيل العميل بدون جلسة → تحويل",
    detailsNoSession.status,
  );

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
  // ERP: البيع يحدّث المخزون تلقائيًا عبر حركة مرتبطة
  const stockAfterSaleCreate = await call("GET", `/api/v1/products/${prodA.id}`, A);
  ok(
    stockAfterSaleCreate.json?.data?.stock === 8,
    "البيع يخصم المخزون تلقائيًا (10 ← 8)",
    stockAfterSaleCreate.json?.data?.stock,
  );

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
  ok(prodAfter.json?.data?.stock === 5, "المخزون نقص لـ 5 (8 خصم البيع − 3 سحب)", prodAfter.json?.data?.stock);

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

  /* ---------- 10) عمليات ERP المترابطة ---------- */
  console.log("\n[10] ERP: المنتجات والحالة والمخزون المرتبط بالبيع والشراء");
  // جلسة A انتهت بعد تسجيل الخروج في [8] — نعيد الدخول
  const loginERP = await call("POST", "/api/auth/login", null, {
    email: "admin-a@test.dz",
    password: "password123",
  });
  ok(loginERP.status === 200, "إعادة الدخول لقسم ERP → 200", loginERP.status);
  const E = loginERP.cookie!;
  const getStock = async () =>
    (await call("GET", `/api/v1/products/${prodA.id}`, E)).json?.data?.stock;

  const s0 = await getStock();
  ok(s0 === 5, "نقطة انطلاق المخزون في قسم ERP = 5", s0);

  // (1) حالة المنتج: إيقاف يمنع البيع دون لمس المخزون
  const off = await call("PATCH", `/api/v1/products/${prodA.id}`, E, { status: "inactive" });
  ok(off.status === 200 && off.json?.data?.status === "inactive", "إيقاف المنتج → status=inactive", off.json?.data);
  const blocked = await call("POST", "/api/v1/sales", E, {
    number: "SAL-ERP-1",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 1, price: 100 }],
    discount: 0,
    paymentStatus: "paid",
    note: "",
  });
  ok(blocked.status === 400, "بيع منتج موقوف → 400", blocked.status);
  const s1 = await getStock();
  ok(s1 === 5, "البيع المحجوب لا يمسّ المخزون", s1);
  const on = await call("PATCH", `/api/v1/products/${prodA.id}`, E, { status: "active" });
  ok(on.status === 200 && on.json?.data?.status === "active", "إعادة تفعيل المنتج → active", on.json?.data);

  // (2) البائع الأكبر من المتوفر: ممنوع افتراضيًا، ومسموح مع allowOversell
  const tooMuch = await call("POST", "/api/v1/sales", E, {
    number: "SAL-ERP-2",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 999, price: 100 }],
    discount: 0,
    paymentStatus: "paid",
    note: "",
  });
  ok(tooMuch.status === 400, "بيع أكبر من المتوفر → 400 (الافتراضي)", tooMuch.status);
  const oversellOn = await call("PUT", "/api/settings", E, { allowOversell: true });
  ok(
    oversellOn.status === 200 && oversellOn.json?.data?.allowOversell === true,
    "تفعيل allowOversell → 200",
    oversellOn.json?.data,
  );
  const oversellSale = await call("POST", "/api/v1/sales", E, {
    number: "SAL-ERP-3",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 7, price: 100 }],
    discount: 0,
    paymentStatus: "paid",
    note: "بيع بتجاوز",
  });
  ok(oversellSale.status === 201, "مع allowOversell → بيع7 قطع مقبول", oversellSale.status);
  const s2 = await getStock();
  ok(s2 === -2, "المخزون تحت الصفر بعد البيع المسموح (5 − 7)", s2);
  const oversellOff = await call("PUT", "/api/settings", E, { allowOversell: false });
  ok(
    oversellOff.status === 200 && oversellOff.json?.data?.allowOversell === false,
    "إعادة allowOversell إلى false",
    oversellOff.json?.data,
  );

  // (3) تعديل الكمية (adjust) = تعيين مطلق حتى يصلح المخزون السالب
  const adjust = await call("POST", "/api/v1/movements", E, {
    productId: prodA.id,
    type: "adjust",
    quantity: 10,
    date: "2026-09-25",
    note: "جرد",
  });
  ok(adjust.status === 201, "حركة adjust (تعيين كمية) → 201", adjust.status);
  const s3 = await getStock();
  ok(s3 === 10, "adjust يعيّن الكمية على 10 (مطلقًا)", s3);

  // (4) المورد والشراء يزيدان المخزون بحركة مرتبطة
  const supplier = await call("POST", "/api/v1/suppliers", E, {
    name: "مورد ERP",
    contactName: "سمير",
    email: "s@sup.dz",
    phone: "0550000000",
    address: "",
    note: "",
  });
  ok(supplier.status === 201, "إنشاء مورد → 201", supplier.status);
  const supplierId = supplier.json?.data?.id;
  const purchase = await call("POST", "/api/v1/purchases", E, {
    number: "PUR-ERP-1",
    date: "2026-09-25",
    supplierId,
    items: [{ productId: prodA.id, quantity: 5, price: 60 }],
    discount: 0,
    paymentStatus: "unpaid",
    note: "",
  });
  ok(purchase.status === 201, "إنشاء شراء (مرتبط بالمورد) → 201", purchase.status);
  const purchaseId = purchase.json?.data?.id;
  const s4 = await getStock();
  ok(s4 === 15, "الشراء يزيد المخزون (10 ← 15)", s4);
  const movsAfterPurchase = await call("GET", "/api/v1/movements?perPage=500", E);
  const linkedIn = ((movsAfterPurchase.json?.data ?? []) as any[]).find(
    (m) => m.purchaseId === purchaseId && m.type === "in" && m.quantity === 5,
  );
  ok(!!linkedIn, "حركة in مرتبطة بالشراء موجودة", linkedIn);

  // (5) حذف شراء معادله ممنوع إن لم يكفِ المخزون (تحتاج 5 والمتوفر 3)
  const adjustLow = await call("POST", "/api/v1/movements", E, {
    productId: prodA.id,
    type: "adjust",
    quantity: 3,
    date: "2026-09-25",
    note: "",
  });
  ok(adjustLow.status === 201, "إنزال الكمية إلى 3 (adjust)", adjustLow.status);
  const deleteBlocked = await call("DELETE", `/api/v1/purchases/${purchaseId}`, E);
  ok(deleteBlocked.status === 400, "حذف شراء يسبب سلبية → 400", deleteBlocked.status);
  const s5 = await getStock();
  ok(s5 === 3, "الحذف المحجوب لا يغيّر المخزون", s5);
  const adjustUp = await call("POST", "/api/v1/movements", E, {
    productId: prodA.id,
    type: "adjust",
    quantity: 10,
    date: "2026-09-25",
    note: "",
  });
  ok(adjustUp.status === 201, "رفع الكمية إلى 10", adjustUp.status);
  const deleteOk = await call("DELETE", `/api/v1/purchases/${purchaseId}`, E);
  ok(deleteOk.status === 200, "حذف شراء معادله → 200 (يُعكس المخزون)", deleteOk.status);
  const s6 = await getStock();
  ok(s6 === 5, "حذف الشراء يُرجع المخزون (10 ← 5)", s6);

  // (6) حذف بيع قديم بلا حركات مرتبطة → بلا أي تعديل مخزون
  const legacySale = await call("POST", "/api/v1/sales", E, {
    number: "SAL-ERP-4",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 1, price: 100 }],
    discount: 0,
    paymentStatus: "paid",
    note: "",
  });
  ok(legacySale.status === 201, "بيع رابع → 201", legacySale.status);
  const s7 = await getStock();
  ok(s7 === 4, "البيع الرابع خصم قطعة (5 ← 4)", s7);
  const unlink = await pg.query(`UPDATE "InventoryMovement" SET "saleId" = NULL WHERE "saleId" = $1`, [
    legacySale.json?.data?.id,
  ]);
  ok(unlink.rowCount === 1, "فصل الحركة المرتبطة (يحاكي مستندًا قديمًا)", unlink.rowCount);
  const deleteLegacy = await call("DELETE", `/api/v1/sales/${legacySale.json?.data?.id}`, E);
  ok(deleteLegacy.status === 200, "حذف بيع قديم (بلا حركات) → 200", deleteLegacy.status);
  const s8 = await getStock();
  ok(s8 === 4, "مستند قديم بلا حركات = بلا تعديل مخزون إطلاقًا", s8);

  // (7) حذف بيع حديث مرتبط يعكس صافي حركاته فقط
  const deleteOriginal = await call("DELETE", `/api/v1/sales/${sale.json?.data?.id}`, E);
  ok(deleteOriginal.status === 200, "حذف البيع الأصلي → 200", deleteOriginal.status);
  const s9 = await getStock();
  ok(s9 === 6, "حذف البيع يعكس الحركة المرتبطة فقط (4 ← 6 = +2)", s9);

  /* ---------- 11) نظام الفواتير الاحترافي ---------- */
  console.log("\n[11] الفواتير: لقطة من بيع + مبلغ محسب + صفحة طباعة A4");

  // بيع خاص بالقسم (خصم 10 + دفع جزئي) — المخزون يتحرك لأن هذا بيع
  const saleForInvoice = await call("POST", "/api/v1/sales", E, {
    number: "SAL-INV-1",
    date: "2026-09-25",
    customerId: custA.id,
    items: [{ productId: prodA.id, quantity: 3, price: 100 }],
    discount: 10,
    paymentStatus: "partial",
    note: "",
  });
  ok(saleForInvoice.status === 201, "بيع مصدر للفاتورة → 201", saleForInvoice.status);
  const saleForInvoiceId = saleForInvoice.json?.data?.id;

  // إنشاء فاتورة مرتبطة (بنود + خصم + حالة دفع + رقم تلقائي INV-)
  const invoice = await call("POST", "/api/v1/invoices", E, {
    number: "INV-ERP-1",
    date: "2026-09-25",
    dueDate: "2026-10-10",
    customerId: custA.id,
    saleId: saleForInvoiceId,
    items: [{ productId: prodA.id, quantity: 3, price: 100 }],
    discount: 10,
    paymentStatus: "partial",
    status: "sent",
    note: "فاتورة اختبار",
  });
  ok(invoice.status === 201, "إنشاء فاتورة (بنود + خصم) → 201", invoice.status);
  const invId = invoice.json?.data?.id;
  ok(invoice.json?.data?.amount === 290, "الإجمالي محسب: 300 − خصم 10 = 290", invoice.json?.data?.amount);
  ok(invoice.json?.data?.items?.[0]?.name === "منتج أ", "اسم المنتج منسوخ في لقطة البند", invoice.json?.data?.items?.[0]);
  ok(invoice.json?.data?.saleNumber === "SAL-INV-1", "رقم البيع المصدر منسوخ في الفاتورة", invoice.json?.data?.saleNumber);
  ok(invoice.json?.data?.paymentStatus === "partial", "حالة الدفع partial محفوظة", invoice.json?.data?.paymentStatus);

  // رقم مكرر → 409 (الرقم التلقائي INV- لا يتكرر)
  const dupInvoice = await call("POST", "/api/v1/invoices", E, {
    number: "INV-ERP-1",
    date: "2026-09-25",
    dueDate: "2026-10-10",
    customerId: custA.id,
    amount: 100,
    status: "draft",
    note: "",
  });
  ok(dupInvoice.status === 409, "رقم فاتورة مكرر → 409", dupInvoice.status);

  // الفاتورة لا تلمس المخزون إطلاقًا
  const stockAfterInvoice = await getStock();
  ok(stockAfterInvoice === 3, "الفاتورة لا تغيّر المخزون (البيع فقط)", stockAfterInvoice);

  // تعديل الخصم يعيد حساب الإجمالي ويحفظ حالة الدفع
  const patchDiscount = await call("PATCH", `/api/v1/invoices/${invId}`, E, { discount: 0 });
  ok(patchDiscount.status === 200 && patchDiscount.json?.data?.amount === 300, "خصم 0 → الإجمالي 300", patchDiscount.json?.data);
  ok(patchDiscount.json?.data?.paymentStatus === "partial", "التعديل الجزئي لا يمسّ حالة الدفع", patchDiscount.json?.data?.paymentStatus);

  // اللقطة مستقلة: تعديل البيع لاحقًا لا يغيّر الفاتورة
  const patchSaleAfter = await call("PATCH", `/api/v1/sales/${saleForInvoiceId}`, E, {
    items: [{ productId: prodA.id, quantity: 2, price: 100 }],
  });
  ok(patchSaleAfter.status === 200, "تعديل بنود البيع بعد الإصدار → 200", patchSaleAfter.status);
  const invAfterSaleEdit = await call("GET", `/api/v1/invoices/${invId}`, E);
  ok(invAfterSaleEdit.json?.data?.amount === 300, "الفاتورة لم تتغير بعد تعديل البيع (300)", invAfterSaleEdit.json?.data?.amount);
  ok(invAfterSaleEdit.json?.data?.items?.[0]?.quantity === 3, "بنود الفاتورة لقطة ثابتة (3 قطع)", invAfterSaleEdit.json?.data?.items?.[0]?.quantity);

  // صفحة الفاتورة (عرض A4): 200 بالجلسة، تحويل بدونها
  const invoicePage = await fetch(`${BASE}/invoices/${invId}`, {
    headers: { cookie: E },
    redirect: "manual",
  });
  ok(invoicePage.status === 200, "صفحة الفاتورة A4 → 200", invoicePage.status);
  const invoiceNoSession = await fetch(`${BASE}/invoices/${invId}`, { redirect: "manual" });
  ok(
    invoiceNoSession.status >= 300 && invoiceNoSession.status < 400,
    "صفحة الفاتورة بدون جلسة → تحويل",
    invoiceNoSession.status,
  );

  // توافق المسار القديم: فاتورة بمبلغ يدوي بلا بنود
  const legacyInvoice = await call("POST", "/api/v1/invoices", E, {
    number: "INV-ERP-2",
    date: "2026-09-25",
    dueDate: "2026-10-10",
    customerId: custA.id,
    amount: 500,
    status: "draft",
    note: "",
  });
  ok(legacyInvoice.status === 201 && legacyInvoice.json?.data?.amount === 500, "فاتورة يدوية بلا بنود → 201 (مبلغ محفوظ)", legacyInvoice.json?.data);

  // حذف الفاتورة لا يمسّ المخزون ولا يمسّ البيع
  const deleteInvoice = await call("DELETE", `/api/v1/invoices/${invId}`, E);
  ok(deleteInvoice.status === 200, "حذف فاتورة → 200", deleteInvoice.status);
  const stockAfterInvoiceDelete = await getStock();
  ok(stockAfterInvoiceDelete === 4, "حذف الفاتورة لا يغيّر المخزون (بيع فقط خصم −1 ← 4)", stockAfterInvoiceDelete);
  const saleStillThere = await call("GET", `/api/v1/sales/${saleForInvoiceId}`, E);
  ok(saleStillThere.status === 200, "البيع المصدري سليم بعد حذف الفاتورة", saleStillThere.status);

  // لوحة التحكم (مركز التحكم) تُعرض بالجلسة
  const dashPage = await fetch(`${BASE}/dashboard`, {
    headers: { cookie: E },
    redirect: "manual",
  });
  ok(dashPage.status === 200, "صفحة لوحة التحكم → 200", dashPage.status);

  /* ---------- 12) الاشتراك SaaS: تجربة · حدود · صفحات عامة ---------- */
  console.log("\n[12] الاشتراك SaaS: تجربة · حدود FREE/BASIC/BUSINESS · عدمحدود PRO · صفحة الأسعار");

  // صورة الاشتراك بعد التهيئة: تجربة على BUSINESS
  const sub0 = await call("GET", "/api/subscription", E);
  ok(sub0.status === 200, "GET /api/subscription → 200", sub0.status);
  const sub = sub0.json?.data;
  ok(sub?.plan === "business" && sub?.status === "trial", "مؤسسة جديدة في تجربة BUSINESS", sub);
  ok(sub?.trialEndsAt != null && new Date(sub.trialEndsAt).getTime() > Date.now(), "trialEndsAt في المستقبل", sub?.trialEndsAt);
  ok(sub?.daysLeft >= 1 && sub?.daysLeft <= 14, "أيام التجربة المتبقية بين 1 و14", sub?.daysLeft);
  ok(sub?.limits?.users === 15 && sub?.limits?.storageMB === 500, "حدود BUSINESS: 15 مستخدمًا · 500 م.ب", sub?.limits);
  ok(sub?.currentPeriodStart === null && sub?.currentPeriodEnd === null, "currentPeriodStart/End = null (جاهزية دفع بلا مزوّد)", sub);

  // الاستخدام حقيقي من قاعدة البيانات (أطوال القوائم + بايتات التخزين)
  const customersNow = await call("GET", "/api/v1/customers", E);
  ok(
    sub?.usage?.customers === (customersNow.json?.data?.length ?? -1),
    "usage.customers = عدد العملاء الحقيقي",
    { usage: sub?.usage?.customers, list: customersNow.json?.data?.length },
  );
  const productsNow = await call("GET", "/api/v1/products", E);
  ok(
    sub?.usage?.products === (productsNow.json?.data?.length ?? -1),
    "usage.products = عدد المنتجات الحقيقي",
    { usage: sub?.usage?.products, list: productsNow.json?.data?.length },
  );
  ok(
    typeof sub?.usage?.storageBytes === "number" && sub.usage.storageBytes > 0,
    "مساحة التخزين = pg_column_size > 0",
    sub?.usage?.storageBytes,
  );
  ok(
    sub?.remaining?.products === sub.limits.products - sub.usage.products,
    "remaining.products = limit − usage",
    sub?.remaining?.products,
  );

  // تبديل داخل التجربة: BASIC يُقبل بنفس التجربة
  const toBasic = await call("PUT", "/api/subscription", E, { plan: "basic" });
  ok(
    toBasic.status === 200 && toBasic.json?.data?.plan === "basic" && toBasic.json?.data?.status === "trial",
    "تبديل إلى BASIC أثناء التجربة → 200 (نفس التجربة)",
    toBasic.json?.data,
  );

  // PRO: موارد غير محدودة أثناء التجربة (تتجاوز حدود FREE بوضوح)
  const toPro = await call("PUT", "/api/subscription", E, { plan: "pro" });
  ok(
    toPro.status === 200 && toPro.json?.data?.plan === "pro" && toPro.json?.data?.status === "trial",
    "تبديل إلى PRO أثناء التجربة → 200",
    toPro.json?.data?.plan,
  );
  ok(toPro.json?.data?.limits?.users === null && toPro.json?.data?.limits?.storageMB === 2048, "PRO: حدود غير محدودة (users=null · 2048MB)", toPro.json?.data?.limits);
  const proUserA = await call("POST", "/api/v1/users", E, {
    name: "مستخدم PRO أ", email: "pro-unlimited-a@test.dz", phone: "", role: "employee", status: "active",
  });
  const proUserB = await call("POST", "/api/v1/users", E, {
    name: "مستخدم PRO ب", email: "pro-unlimited-b@test.dz", phone: "", role: "employee", status: "active",
  });
  ok(
    proUserA.status === 201 && proUserB.status === 201,
    "PRO: إنشاء مستخدمين تجاوزا حد FREE (4 مستخدمين) → 201 + 201",
    [proUserA.status, proUserB.status],
  );

  // BASIC: حد5 مستخدمين مفروض فعليًا
  const backBasic = await call("PUT", "/api/subscription", E, { plan: "basic" });
  ok(backBasic.status === 200 && backBasic.json?.data?.plan === "basic", "العودة إلى BASIC → 200 (حدود=5)", backBasic.json?.data?.plan);
  const basicFill = await call("POST", "/api/v1/users", E, {
    name: "مستخدم BASIC", email: "basic-limit-fill@test.dz", phone: "", role: "employee", status: "active",
  });
  ok(basicFill.status === 201, "BASIC: ملء الحد الخامس → 201", basicFill.status);
  const basicOver = await call("POST", "/api/v1/users", E, {
    name: "زائد BASIC", email: "basic-limit-over@test.dz", phone: "", role: "employee", status: "active",
  });
  ok(
    basicOver.status === 403 && basicOver.json?.error?.code === "SUBSCRIPTION_LIMIT_REACHED",
    "BASIC: تجاوز الحد → 403 + SUBSCRIPTION_LIMIT_REACHED",
    basicOver.json?.error,
  );

  // انتهاء التجربة: ترقية كسولة إلى expired + رفض الخطة المدفوعة (جاهزية Stripe)
  const meE = await call("GET", "/api/auth/me", E);
  const orgIdE = meE.json?.data?.organization?.id;
  ok(typeof orgIdE === "string" && orgIdE.length > 0, "جلسة مؤسسة الجلسة الحالية من /api/auth/me", orgIdE);
  await pg.query(
    `UPDATE "Subscription" SET "trialEndsAt" = now() - interval '1 day' WHERE "organizationId" = $1`,
    [orgIdE],
  );
  const paid = await call("PUT", "/api/subscription", E, { plan: "business" });
  ok(paid.status === 403, "خطة مدفوعة بعد انتهاء التجربة → 403 (Stripe لاحقًا)", paid.status);
  const subExpired = await call("GET", "/api/subscription", E);
  ok(subExpired.json?.data?.status === "expired", "الحالة تُرقّى تلقائيًا إلى expired", subExpired.json?.data?.status);
  ok(subExpired.json?.data?.effectivePlan === "free", "الخطة الفعلية بعد الانتهاء = free", subExpired.json?.data?.effectivePlan);

  // التحول إلى FREE يُقبل دائمًا وضبط الحدود
  const toFree = await call("PUT", "/api/subscription", E, { plan: "free" });
  ok(
    toFree.status === 200 && toFree.json?.data?.plan === "free" && toFree.json?.data?.effectivePlan === "free",
    "تبديل إلى FREE → 200 (خطة فعلية free)",
    toFree.json?.data?.plan,
  );
  ok(toFree.json?.data?.limits?.users === 3, "حدود FREE فعّالة: 3 مستخدمين", toFree.json?.data?.limits?.users);

  // فرض حد المستخدمين: ملء الحد ثم الرفض بـ403
  const usersNow = await call("GET", "/api/v1/users", E);
  let ucount = usersNow.json?.data?.length ?? 0;
  while (ucount < 3) {
    const r = await call("POST", "/api/v1/users", E, {
      name: `حد-خطة-${ucount}`,
      email: `limit-plan-${ucount}@test.dz`,
      phone: "",
      role: "employee",
      status: "active",
    });
    ok(r.status === 201, `ملء حد المستخدمين في FREE (${ucount + 1}/3) → 201`, r.status);
    ucount++;
  }
  const over = await call("POST", "/api/v1/users", E, {
    name: "مستخدم زائد",
    email: "limit-plan-over@test.dz",
    phone: "",
    role: "employee",
    status: "active",
  });
  ok(over.status === 403, "تجاوز حد مستخدمي FREE → 403 (خطة أعلى)", over.status);
  ok(
    over.json?.error?.code === "SUBSCRIPTION_LIMIT_REACHED",
    "كود الخطأ المعياري SUBSCRIPTION_LIMIT_REACHED",
    over.json?.error?.code,
  );

  // الصفحات: الأسعار عامة، الاشتراك محمي بالجلسة
  const pricingPage = await fetch(`${BASE}/pricing`, { redirect: "manual" });
  ok(pricingPage.status === 200, "صفحة الأسعار /pricing عامة → 200", pricingPage.status);
  const subPage = await fetch(`${BASE}/subscription`, {
    headers: { cookie: E },
    redirect: "manual",
  });
  ok(subPage.status === 200, "صفحة الاشتراك بجلسة → 200", subPage.status);
  const subPageNo = await fetch(`${BASE}/subscription`, { redirect: "manual" });
  ok(
    subPageNo.status >= 300 && subPageNo.status < 400,
    "صفحة الاشتراك بدون جلسة → تحويل",
    subPageNo.status,
  );

  // BUSINESS: مؤسسة جديدة (15 مستخدمًا) — الحد مفروض فعليًا
  const registerD = await call("POST", "/api/auth/register", null, {
    organizationName: "مؤسسة حد الأعمال",
    name: "مالك الأعمال",
    email: "biz-limit-owner@test.dz",
    password: "password123",
  });
  ok(registerD.status === 201, "تسجيل مؤسسة اختبار BUSINESS → 201", registerD.status);
  const D = registerD.cookie!;
  for (let i = 1; i <= 14; i++) {
    await call("POST", "/api/v1/users", D, {
      name: `موظف أعمال ${i}`, email: `biz-limit-${i}@test.dz`, phone: "", role: "employee", status: "active",
    });
  }
  const bizOver = await call("POST", "/api/v1/users", D, {
    name: "زائد الأعمال", email: "biz-limit-over@test.dz", phone: "", role: "employee", status: "active",
  });
  ok(
    bizOver.status === 403 && bizOver.json?.error?.code === "SUBSCRIPTION_LIMIT_REACHED",
    "BUSINESS: تجاوز الحد15 → 403 + SUBSCRIPTION_LIMIT_REACHED",
    bizOver.json?.error,
  );
  const bizSub = await call("GET", "/api/subscription", D);
  ok(bizSub.json?.data?.usage?.users === 15 && bizSub.json?.data?.remaining?.users === 0, "BUSINESS: usage=15 · remaining=0 (حساب الاستخدام)", bizSub.json?.data?.usage);

  await pg.end();

  console.log(`\n════════ النتيجة: ${passed} نجح / ${failed} فشل ════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
