// NORMA · fonction serveur « rapport-soir » — fichier généré par app/scripts/build-fonctions.mjs, à coller tel quel.

// ../supabase/functions/rapport-soir/index.ts
import pdfMake from "npm:pdfmake@0.2.10/build/pdfmake.js";
import vfsFonts from "npm:pdfmake@0.2.10/build/vfs_fonts.js";

// src/report/dailyReport.ts
var localIso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
var C = {
  green: "#1E7A34",
  greenBg: "#E3F2E7",
  red: "#9B1C2C",
  redSoft: "#F3CDD2",
  redBg: "#FBEBED",
  yellowBg: "#FFF1B8",
  grey: "#555555",
  zebra: "#F6F7F9",
  bandOk: "#D3EBDA",
  bandOkText: "#14532D",
  bandWarn: "#FFE58F",
  bandBad: "#F3CDD2",
  bandBadText: "#7A1020"
};
async function verificationCode(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
var badge = (kind, text) => ({
  text: ` ${text} `,
  bold: kind !== "ok",
  color: kind === "bad" ? C.bandBadText : kind === "warn" ? "#000000" : C.green,
  fillColor: kind === "bad" ? C.redSoft : kind === "warn" ? C.yellowBg : C.greenBg
});
var sectionBand = (n, title, summary, bad) => ({
  // @ts-expect-error pdfmake accepte « id » sur tout nœud (utilisé par pageBreakBefore)
  id: `band-${n}`,
  table: { widths: ["*", "auto"], body: [[
    { text: `${n}. ${title}`, bold: true, fontSize: 10.5, color: bad === "warn" ? "#000000" : bad ? C.bandBadText : C.bandOkText, margin: [6, 2, 0, 2] },
    { text: summary, fontSize: 10, bold: !!bad, color: bad === "warn" ? "#000000" : bad ? C.bandBadText : C.bandOkText, alignment: "right", margin: [0, 3, 6, 2] }
  ]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => bad === "warn" ? C.bandWarn : bad ? C.bandBad : C.bandOk },
  margin: [0, 9, 0, 3]
});
function table(headers, rows, widths, empty, badRows = []) {
  if (rows.length === 0) return { text: empty, italics: true, color: C.grey, margin: [6, 0, 0, 0] };
  return {
    table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths, body: [headers.map((h) => ({ text: h.toUpperCase(), fontSize: 7, bold: true, color: C.grey })), ...rows] },
    layout: {
      hLineWidth: (i) => i === 1 ? 1 : 0,
      vLineWidth: () => 0,
      hLineColor: () => "#999999",
      fillColor: (r) => r === 0 ? null : badRows[r - 1] ? C.redBg : r % 2 === 0 ? C.zebra : null,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
      paddingLeft: () => 5,
      paddingRight: () => 5
    },
    fontSize: 8.8
  };
}
function reportSummary(d) {
  const rRed = d.readings.filter((r) => r.status === "rouge").length;
  const oilBad = d.oil.filter((o) => o.aspect !== "Normal" || o.moment !== "Soir" && /changer/i.test(o.actions)).length;
  const oilWarn = d.oil.filter((o) => o.moment === "Soir" && /changer/i.test(o.actions)).length;
  const recBad = d.receptions.filter((r) => r.result !== "Accept\xE9e").length;
  const notApte = d.attendance.filter((a) => a.apte !== true).length;
  const ncOpen = d.ncs.filter((n) => n.status !== "Cl\xF4tur\xE9e").length;
  const lotsOut = d.lots.filter((l) => l.disposed !== "\u2014").length;
  const ecarts = rRed + oilBad + recBad + d.cleaningMissed.length + notApte;
  const totalControls = d.readings.length + d.oil.length + d.receptions.length + d.cleaning.length + d.cleaningMissed.length + d.attendance.length;
  const score = Math.max(0, Math.round(totalControls ? 100 * (totalControls - ecarts) / totalControls : 100) - 10 * ncOpen);
  return { rRed, oilBad, oilWarn, recBad, notApte, ncOpen, lotsOut, ecarts, score };
}
function verdictText(d) {
  const { ncOpen, ecarts } = reportSummary(d);
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  return ncOpen ? `${plural(ncOpen, "non-conformit\xE9")} encore ouverte${ncOpen > 1 ? "s" : ""}` : ecarts ? `Journ\xE9e ma\xEEtris\xE9e : ${plural(ecarts, "\xE9cart")} d\xE9tect\xE9${ecarts > 1 ? "s" : ""} et trait\xE9${ecarts > 1 ? "s" : ""}` : "Journ\xE9e conforme : aucun \xE9cart";
}
function buildDailyReport(d, code) {
  const day2 = d.date.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const { rRed, oilBad, oilWarn, recBad, notApte, ncOpen, lotsOut, ecarts, score } = reportSummary(d);
  const synth = [
    ["Pr\xE9sence et prise de poste", plural(d.attendance.length, "personne"), notApte ? "bad" : "ok", notApte ? `${notApte} non apte / non faite` : "Tous aptes"],
    ["Temp\xE9ratures", plural(d.readings.length, "relev\xE9"), rRed ? "bad" : "ok", rRed ? plural(rRed, "\xE9cart") : "Conforme"],
    ["Huile de friture", plural(d.oil.length, "contr\xF4le"), oilBad ? "bad" : oilWarn ? "warn" : "ok", oilBad ? plural(oilBad, "\xE9cart") : oilWarn ? "Changement pr\xE9vu demain" : "Conforme"],
    ["R\xE9ceptions", plural(d.receptions.length, "livraison"), recBad ? "bad" : "ok", recBad ? plural(recBad, "refus") : "Conforme"],
    ["Nettoyage", plural(d.cleaning.length, "t\xE2che") + " faite" + (d.cleaning.length > 1 ? "s" : ""), d.cleaningMissed.length ? "bad" : "ok", d.cleaningMissed.length ? plural(d.cleaningMissed.length, "retard") : "\xC0 jour"],
    ["Pr\xE9parations et lots", plural(d.lots.length, "lot"), "ok", lotsOut ? `${lotsOut} \xE9limin\xE9${lotsOut > 1 ? "s" : ""}` : "Conforme"],
    ["Non-conformit\xE9s", plural(d.ncs.length, "incident"), ncOpen ? "bad" : "ok", ncOpen ? plural(ncOpen, "ouverte") : d.ncs.length ? "Toutes cl\xF4tur\xE9es" : "Aucune"]
  ];
  const verdict = { t: verdictText(d), ...ncOpen ? { c: C.bandBadText, bg: C.redBg } : ecarts ? { c: "#000000", bg: C.yellowBg } : { c: C.green, bg: C.greenBg } };
  const thr = (label) => d.thresholds.find((t) => t.label.toLowerCase().startsWith(label.toLowerCase()))?.value ?? "";
  return {
    pageSize: "A4",
    pageMargins: [34, 44, 34, 40],
    // Un bandeau de section ne reste jamais seul en bas de page
    pageBreakBefore: (node) => typeof node.id === "string" && node.id.startsWith("band-") && node.startPosition.top > 841.89 - 40 - 110,
    info: { title: `Rapport HACCP ${localIso(d.date)}`, author: d.company.name },
    header: (page) => page === 1 ? null : { text: `${d.company.name}  \xB7  Rapport HACCP du ${d.date.toLocaleDateString("fr-CH")}  \xB7  ${d.event}`, fontSize: 8, color: C.grey, margin: [34, 20, 34, 0] },
    footer: (page, pages) => ({
      columns: [{ text: `Code de v\xE9rification ${code}`, fontSize: 8, color: C.grey }, { text: `Page ${page} / ${pages}`, fontSize: 8, color: C.grey, alignment: "right" }],
      margin: [34, 14, 34, 0]
    }),
    content: [
      // ---------- Page 1 : en-tête + synthèse lisible en 10 secondes
      { columns: [
        { stack: [
          { text: "RAPPORT JOURNALIER HACCP", fontSize: 9, bold: true, color: C.grey, characterSpacing: 1 },
          { text: d.company.name, fontSize: 17, bold: true },
          { text: d.event, fontSize: 11 }
        ] },
        { stack: [
          { text: cap(day2), fontSize: 13, bold: true, alignment: "right" },
          { text: `Responsable HACCP : ${d.company.responsable}`, fontSize: 9, alignment: "right", color: C.grey },
          { text: `${d.company.address} \xB7 ${d.company.phone}`, fontSize: 9, alignment: "right", color: C.grey }
        ] }
      ] },
      {
        table: { widths: ["*", "auto"], body: [[
          { text: verdict.t, fontSize: 12.5, bold: true, color: verdict.c, margin: [10, 9, 10, 6] },
          { stack: [
            { text: [{ text: String(score), fontSize: 20, bold: true }, { text: " / 100", fontSize: 11 }], color: verdict.c, alignment: "right" },
            { text: "score du jour", fontSize: 8, color: C.grey, alignment: "right" }
          ], margin: [10, 3, 10, 3] }
        ]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => verdict.bg },
        margin: [0, 10, 0, 6]
      },
      { text: "SYNTH\xC8SE DU JOUR", fontSize: 9, bold: true, color: C.grey, characterSpacing: 1, margin: [0, 0, 0, 4] },
      table(["Contr\xF4le", "Volume", "R\xE9sultat"], synth.map(([a, b, k, t]) => [{ text: a, bold: true }, b, badge(k, t)]), ["*", 120, 150], ""),
      {
        text: "Le d\xE9tail de chaque contr\xF4le suit, dans l\u2019ordre du classeur. Les lignes sur fond rouge sont des \xE9carts ; leur action corrective figure au point 7. Seuils et mode de lecture : en fin de rapport.",
        fontSize: 8,
        color: C.grey,
        margin: [0, 4, 0, 0]
      },
      // ---------- Détail
      sectionBand(1, "Pr\xE9sence et prise de poste", notApte ? `${notApte} non apte / non faite` : "Tous aptes", !!notApte),
      table(
        ["Personne", "Poste", "Arriv\xE9e", "D\xE9part", "Pauses", "Prise de poste"],
        d.attendance.map((a) => [{ text: a.name, bold: true }, a.poste, a.arrival, a.departure ?? "en service", a.pauses || "\u2014", a.apte === null ? badge("bad", "Non faite") : a.apte ? badge("ok", "Apte") : badge("bad", "Non apte")]),
        ["*", 70, 42, 50, "*", 72],
        "Aucun pointage.",
        d.attendance.map((a) => a.apte !== true)
      ),
      sectionBand(2, "Temp\xE9ratures", `${plural(d.readings.length, "relev\xE9")}${rRed ? " \xB7 " + plural(rRed, "\xE9cart") : ""}`, !!rRed),
      table(
        ["Heure", "\xC9quipement", "Valeur", "R\xE9sultat", "Par"],
        d.readings.map((r) => [r.time, { text: r.equipment, bold: true }, { text: r.value, bold: true }, r.status === "rouge" ? badge("bad", "\xC9CART") : r.status === "jaune" ? badge("warn", "Limite") : badge("ok", "OK"), `${r.by}${r.source !== "Tablette" ? " (" + r.source + ")" : ""}`]),
        [38, "*", 60, 55, 110],
        "Aucun relev\xE9.",
        d.readings.map((r) => r.status === "rouge")
      ),
      sectionBand(3, "Huile de friture", `${plural(d.oil.length, "contr\xF4le")}${oilBad ? " \xB7 " + plural(oilBad, "\xE9cart") : oilWarn ? " \xB7 changement pr\xE9vu" : ""}`, oilBad ? true : oilWarn ? "warn" : false),
      table(
        ["Heure", "Friteuse", "Moment", "Temp.", "Polaires", "Aspect", "Suite donn\xE9e", "Par"],
        d.oil.map((o) => [o.time, o.fryer, o.moment, o.temp, o.polar, o.aspect === "Normal" ? "Normal" : { text: o.aspect, bold: true, color: C.red }, o.actions, o.by]),
        [32, 55, 38, 36, 40, "*", 75, 45],
        "Aucun contr\xF4le d\u2019huile.",
        d.oil.map((o) => o.aspect !== "Normal")
      ),
      sectionBand(4, "R\xE9ception des marchandises", `${plural(d.receptions.length, "livraison")}${recBad ? " \xB7 " + plural(recBad, "refus") : ""}`, !!recBad),
      table(
        ["Heure", "Produit / fournisseur", "Lot", "DLC", "Temp.", "D\xE9cision"],
        d.receptions.map((r) => [
          r.time,
          { stack: [{ text: r.product, bold: true }, { text: `${r.supplier} \xB7 ${r.by}${r.photo ? " \xB7 bon photographi\xE9" : ""}`, fontSize: 8, color: C.grey }] },
          r.lot,
          r.dlc,
          r.temp,
          r.result === "Accept\xE9e" ? badge("ok", "Accept\xE9e") : badge("bad", r.result)
        ]),
        [32, "*", 60, 50, 40, 80],
        "Aucune r\xE9ception.",
        d.receptions.map((r) => r.result !== "Accept\xE9e")
      ),
      sectionBand(5, "Nettoyage et d\xE9sinfection", `${plural(d.cleaning.length, "t\xE2che")}${d.cleaningMissed.length ? " \xB7 " + plural(d.cleaningMissed.length, "retard") : ""}`, d.cleaningMissed.length > 0),
      table(
        ["Heure", "Zone / \xE9quipement", "Produit", "Par"],
        [
          ...d.cleaningMissed.map((m) => [{ text: m.due, bold: true }, { text: m.item, bold: true }, badge("bad", "NON FAIT \xC0 L\u2019HEURE"), "\u2014"]),
          ...d.cleaning.map((c) => [c.time, { text: c.item, bold: true }, c.product, c.by])
        ],
        [38, "*", "*", 70],
        "Aucun nettoyage enregistr\xE9.",
        [...d.cleaningMissed.map(() => true), ...d.cleaning.map(() => false)]
      ),
      sectionBand(6, "Pr\xE9parations et lots", `${plural(d.lots.length, "lot")} \xB7 conservation ${thr("Pr\xE9parations")}`, false),
      table(["Lot", "Pr\xE9paration", "Par", "Limite", "\xC9limination"], d.lots.map((l) => [{ text: l.lot, bold: true }, l.recipe, l.by, l.useBy, l.disposed]), [85, "*", 55, 65, 100], "Aucune pr\xE9paration."),
      sectionBand(7, "Non-conformit\xE9s et actions correctives", ncOpen ? plural(ncOpen, "ouverte") : d.ncs.length ? "Toutes cl\xF4tur\xE9es" : "Aucune", !!ncOpen),
      ...d.ncs.length === 0 ? [{ text: "Aucune non-conformit\xE9 ce jour.", italics: true, color: C.grey, margin: [6, 0, 0, 0] }] : d.ncs.map((n) => ({
        table: { widths: ["*"], body: [[{ stack: [
          { columns: [{ text: `${n.opened}  \xB7  ${n.kind}`, bold: true, fontSize: 10 }, { ...badge(n.status === "Cl\xF4tur\xE9e" ? "ok" : "bad", n.status), alignment: "right", fontSize: 9 }] },
          { text: n.description, fontSize: 9, margin: [0, 2, 0, 2] },
          { ol: n.steps.length ? n.steps : ["Aucune action enregistr\xE9e"], fontSize: 8.5, color: "#222222" },
          { text: `Signal\xE9 par ${n.by}`, fontSize: 8, color: C.grey, margin: [0, 4, 0, 0] }
        ], margin: [8, 4, 8, 4] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i) => i === 0 ? 3 : 0, vLineColor: () => n.status === "Cl\xF4tur\xE9e" ? C.green : "#D9707D", fillColor: () => C.zebra },
        margin: [0, 0, 0, 5],
        unbreakable: true
      })),
      { columns: [
        { width: "*", stack: [
          { text: "Comment lire ce rapport", fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
          { ul: [
            "Tous les contr\xF4les du jour, dans l\u2019ordre du classeur HACCP ; heure, valeur et auteur pour chaque ligne.",
            "Fond rouge = \xE9cart (action corrective au point 7) ; jaune = \xE0 surveiller ; \xAB (iPhone \u2026) \xBB = saisie de d\xE9pannage.",
            "Enregistrements non modifiables : une correction appara\xEEt comme une nouvelle ligne. Sant\xE9 : apte / non apte uniquement.",
            "Code de v\xE9rification : correspond aux donn\xE9es du jour ; un document modifi\xE9 ne correspond plus au code conserv\xE9.",
            "Score du jour : indicateur interne sans valeur r\xE9glementaire (% de contr\xF4les conformes, \u221210 par non-conformit\xE9 ouverte).",
            "L\u2019application aide \xE0 l\u2019autocontr\xF4le ; elle ne remplace pas la responsabilit\xE9 de l\u2019exploitant."
          ], fontSize: 7.3, color: "#333333" }
        ] },
        { width: 230, stack: [
          { text: "Seuils appliqu\xE9s et sources", fontSize: 9, bold: true, margin: [0, 0, 0, 2] },
          {
            table: { widths: ["*", "auto"], body: d.thresholds.map((t) => [{ text: [{ text: t.label, bold: true }, { text: ` \xB7 ${t.source}`, color: C.grey }], fontSize: 7 }, { text: t.value, fontSize: 7.3, bold: true }]) },
            layout: { hLineWidth: () => 0.3, vLineWidth: () => 0, hLineColor: () => "#CCCCCC", paddingTop: () => 1.5, paddingBottom: () => 1.5 }
          }
        ] }
      ], columnGap: 14, margin: [0, 12, 0, 0], unbreakable: true },
      { columns: [
        { text: "Visa du responsable", fontSize: 9, bold: true, width: 110, margin: [0, 10, 0, 0] },
        {
          table: { widths: ["*", 90, "*"], body: [[{ text: "Nom", fontSize: 7, color: C.grey, margin: [0, 0, 0, 14] }, { text: "Date", fontSize: 7, color: C.grey }, { text: "Signature", fontSize: 7, color: C.grey }]] },
          layout: { hLineWidth: (i) => i === 1 ? 0.8 : 0, vLineWidth: () => 0 }
        }
      ], margin: [0, 8, 0, 0], unbreakable: true }
    ],
    defaultStyle: { fontSize: 9, lineHeight: 1.1 }
  };
}

// ../supabase/functions/_commun/serveur.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
var cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function admin() {
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Cl\xE9 secr\xE8te du projet introuvable");
  return createClient(Deno.env.get("SUPABASE_URL"), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function cronAutorise(req, sb) {
  const secret = req.headers.get("x-norma-cron");
  if (!secret) return false;
  const { data } = await sb.schema("norma").rpc("cron_verifier", { p_secret: secret });
  return data === true;
}

// ../supabase/functions/rapport-soir/index.ts
var pm = pdfMake;
var fonts = vfsFonts;
pm.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
var day = (s) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
var dmy = (s) => s.slice(0, 10).split("-").reverse().join(".");
var pdfBase64 = (doc) => new Promise((ok) => pm.createPdf(doc).getBase64((b) => ok(b)));
async function envoyer(to, sujet, html, fichier, contenu) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY") ?? "", "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "NORMA", email: Deno.env.get("NORMA_EXPEDITEUR") },
      to: to.map((email) => ({ email })),
      subject: sujet,
      htmlContent: html,
      attachment: [{ name: fichier, content: contenu }]
    })
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${await r.text()}`);
}
Deno.serve(async (req) => {
  const sb = admin();
  if (!await cronAutorise(req, sb)) return json({ error: "Non autoris\xE9" }, 401);
  const db = sb.schema("norma");
  const { data: list, error } = await db.rpc("rapports_a_envoyer", { p_now: (/* @__PURE__ */ new Date()).toISOString() });
  if (error) return json({ error: error.message }, 500);
  const done = [];
  for (const r of list) {
    const data = { ...r.report, date: day(r.report.date), generatedAt: new Date(r.report.generatedAt) };
    if (r.to.length) {
      const code = await verificationCode(data);
      const pdf = await pdfBase64(buildDailyReport(data, code));
      const html = `<p>Bonjour,</p><p>Voici le rapport HACCP du <b>${dmy(r.day)}</b>${data.event ? ` (${data.event})` : ""} de ${r.entreprise}.</p><p><b>${verdictText(data)}</b> \xB7 score ${reportSummary(data).score}/100</p><p>\xC0 imprimer et \xE0 ranger dans le classeur du stand.</p><p style="color:#777">Code de v\xE9rification : ${code}<br>Message automatique de NORMA.</p>`;
      await envoyer(r.to, `Rapport HACCP du ${dmy(r.day)} \xB7 ${r.entreprise}`, html, `NORMA-rapport-${r.day.slice(0, 10)}.pdf`, pdf);
    }
    await db.rpc("rapport_envoye", { p_company: r.companyId, p_day: r.day, p_n: r.to.length });
    done.push(`${r.entreprise} ${r.day}`);
  }
  return json({ envoyes: done });
});
