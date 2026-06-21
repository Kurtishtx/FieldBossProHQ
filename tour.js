/* ── SprayBossPro Page Tours ── */
/* Requires intro.js loaded on the page */

/* ── Supabase dismissal storage ── */
var _tsb = null, _tuid = null, _tdismissed = null, _tBtnEnabled = null;
var _TURL = 'https://knjdbgroiyhvqwrpqzcx.supabase.co';
var _TKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuamRiZ3JvaXlodnF3cnBxemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTczMDMsImV4cCI6MjA5NTA3MzMwM30.zoExtkem-XZqU86S4yJjA_xOOaS1G0IPU2M9OAAza2g';

function _tClient() {
  if (!_tsb) _tsb = window.supabase.createClient(_TURL, _TKEY, {auth:{autoRefreshToken:false,detectSessionInUrl:false}});
  return _tsb;
}
async function _tUid() {
  if (_tuid) return _tuid;
  try { var {data} = await _tClient().auth.getSession(); _tuid = data&&data.session ? data.session.user.id : null; } catch(e) {}
  return _tuid;
}
async function _tGetDismissed() {
  if (_tdismissed !== null) return _tdismissed;
  var uid = await _tUid();
  if (!uid) return (_tdismissed = []);
  try {
    var {data} = await _tClient().from('company_info').select('tour_dismissals,tour_buttons_enabled').eq('user_id', uid).single();
    _tdismissed = JSON.parse((data && data.tour_dismissals) || '[]');
    _tBtnEnabled = !(data && data.tour_buttons_enabled === false);
  } catch(e) { _tdismissed = []; _tBtnEnabled = true; }
  return _tdismissed;
}
async function _tDismiss(pageKey) {
  var uid = await _tUid();
  if (!uid) return;
  var d = await _tGetDismissed();
  if (!d.includes(pageKey)) {
    d.push(pageKey);
    _tdismissed = d;
    try { await _tClient().from('company_info').update({tour_dismissals: JSON.stringify(d)}).eq('user_id', uid); } catch(e) {}
  }
  var btn = document.querySelector('.help-tour-btn');
  if (btn) btn.style.display = 'none';
}
async function initTourBtn(pageKey) {
  var d = await _tGetDismissed();
  var btn = document.querySelector('.help-tour-btn');
  if (!btn) return;
  if (_tBtnEnabled === false || d.includes(pageKey)) btn.style.display = 'none';
}
document.addEventListener('DOMContentLoaded', function() {
  var btn = document.querySelector('.help-tour-btn[data-tour-page]');
  if (btn) initTourBtn(btn.getAttribute('data-tour-page'));
});

/* ── Tour step definitions ── */
var TOUR_STEPS = {

  waitinglist: [
    { intro: '<strong>Welcome to the Waiting List!</strong><br/><br/>This is where all your upcoming jobs live before they\'re dispatched. Let\'s walk through everything on this page.' },
    { element: '#page-header', intro: '<strong>Summary Stats</strong><br/>At a glance — how many properties are waiting, total services, and the dollar value of your waiting list today.' },
    { element: '#toggle-map-btn', intro: '<strong>Map View</strong><br/>Click this to switch between list view and a pin map. The map shows all waiting properties so you can plan your route geographically.' },
    { element: '.filter-bar', intro: '<strong>Filter Tabs</strong><br/>Filter your list by Service type, Tags, or Status. The <em>Past Due</em> tab shows jobs that are overdue based on their last service date.' },
    { element: '.toolbar', intro: '<strong>Toolbar</strong><br/>Save custom views and pick a reference date to control which jobs appear. Use <em>Saved Views</em> to quickly switch between different filter combinations.' },
    { element: '#drp-input', intro: '<strong>Date Range Picker</strong><br/>Shows all jobs pending or scheduled on this date or before. Set it to today to see everything that should be done today, or push it out a few days to plan ahead.' },
    { element: '#use-min-days', intro: '<strong>Use Min Days Since</strong><br/>When checked, the date you set here controls the cutoff — only jobs due on or before that date are shown. Uncheck it to see your full list regardless of due date.' },
    { intro: '<strong>You\'re ready!</strong><br/><br/>Click any row to open the property and schedule a service. Use the checkboxes to select multiple and batch-dispatch them. Hit <em>Print</em> to get a route sheet.' }
  ],

  scheduledlist: [
    { intro: '<strong>Welcome to the Scheduled List!</strong><br/><br/>These are jobs that have been dispatched to a technician and are actively scheduled. Let\'s walk through this page.' },
    { element: '#page-header', intro: '<strong>Summary Stats</strong><br/>Shows how many properties are on today\'s schedule, total jobs, and the revenue total for the current view.' },
    { element: '#toggle-map-btn', intro: '<strong>Map View</strong><br/>Switch to a route map to see all scheduled stops for the day. Drag pins to reorder your route before sending it to your tech.' },
    { element: '.filter-bar', intro: '<strong>Filter Tabs</strong><br/>Filter by Service type, Tags, Status (Scheduled, Completed, Skipped), or by which Truck/Tech is assigned.' },
    { element: '.toolbar', intro: '<strong>Date Picker</strong><br/>Use the date picker to jump to a specific day\'s schedule. The list updates instantly to show only jobs for that date.' },
    { intro: '<strong>Updating Job Status</strong><br/><br/>Click any row to open the job. From there you can mark it Completed, Skipped, or Rescheduled. Completed jobs are recorded in service history on the property.' }
  ],

  invoices: [
    { intro: '<strong>Welcome to Invoices!</strong><br/><br/>Create, track, and manage all your client invoices here. Let\'s walk through the key features.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Invoice</strong><br/>Click here to create a new invoice. You\'ll select the client, add line items from your service catalog, apply taxes and discounts, then save.' },
    { element: '.toolbar', intro: '<strong>Actions Toolbar</strong><br/>Select invoices using the checkboxes, then use <em>Actions</em> to batch-email, export, or delete them. You can also change page size to see more at once.' },
    { element: '#invoice-tbody', intro: '<strong>Invoice Rows</strong><br/>Each row is one invoice. Click it to open the full invoice — you can edit it, email it to the client, record a payment, or convert it to a PDF.' },
    { element: '#total-invtotal', intro: '<strong>Total Value</strong><br/>Shows the combined dollar value of all invoices in the current view. Filter by status to see outstanding balances or this month\'s collections.' },
    { intro: '<strong>Sending Invoices</strong><br/><br/>Open any invoice and click the <em>Email</em> button to send it directly to the client using your invoice email template. Set up your template in Settings first.' }
  ],

  leadslist: [
    { intro: '<strong>Welcome to Leads!</strong><br/><br/>Leads are prospects — people who haven\'t signed up yet. Manage your sales pipeline and send estimates from here.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Lead</strong><br/>Click here to add a new prospect. Enter their name, contact info, and what services they\'re interested in. You can then send them an estimate.' },
    { element: '#map-toggle-btn', intro: '<strong>Map View</strong><br/>See all your leads on a pin map. Useful for knowing which neighborhoods have prospects so you can target marketing or plan canvassing routes.' },
    { element: '.filter-tabs', intro: '<strong>Status Filters</strong><br/>Switch between All, Active, and Closed leads. A lead is marked closed when they convert to a client or you mark them as lost.' },
    { element: '#lead-tbody', intro: '<strong>Lead Rows</strong><br/>Click any row to open the lead profile. From there you can send an estimate, add notes, convert them to a client, or mark them as closed.' },
    { intro: '<strong>Converting a Lead</strong><br/><br/>When a lead agrees to service, open their profile and click <em>Convert to Client</em>. Their contact info moves to the Clients list and you can start scheduling jobs.' }
  ],

  clientlist: [
    { intro: '<strong>Welcome to the Client List!</strong><br/><br/>This is your master list of all customers. Let\'s walk through the key features.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Client</strong><br/>Click here to add a new customer. You\'ll enter their name, contact info, and billing details. Once saved, you can add properties to their account.' },
    { element: '.toolbar', intro: '<strong>Actions Toolbar</strong><br/>Select clients using the checkboxes, then use <em>Actions</em> to export, send a message, or delete multiple clients at once.' },
    { element: '#results-bar', intro: '<strong>Results Bar</strong><br/>Shows how many clients are in your list and which page you\'re on. Use the filter to narrow it down by name, email, or phone.' },
    { element: '#client-tbody', intro: '<strong>Client Rows</strong><br/>Click any row to open the client profile — you\'ll see all their properties, service history, invoices, and contact info in one place.' },
    { intro: '<strong>Tip!</strong><br/><br/>Use the <em>Filters</em> button to find clients by tag, status, or custom field. Tags let you group clients into categories like "Mosquito", "Pest Control", or "VIP".' }
  ],

  propertieslist: [
    { intro: '<strong>Welcome to Properties!</strong><br/><br/>Properties are the service addresses where you do the work — each client can have one or more properties.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Property</strong><br/>Click here to add a new service address. Enter the street address, square footage, and link it to a client. The address is used for routing and maps.' },
    { element: '#map-toggle-btn', intro: '<strong>Map View</strong><br/>Switch to a pin map showing all your properties. Great for checking coverage area or spotting clusters of clients in the same neighborhood.' },
    { element: '.filters-bar', intro: '<strong>Filters</strong><br/>Click to expand and filter by address, client name, tags, or any custom field. Use this to find all properties in a specific zip code or neighborhood.' },
    { element: '#results-bar', intro: '<strong>Results</strong><br/>Shows the total number of properties. Each row is one service address — click it to open the property profile with full service history.' },
    { element: '.toolbar', intro: '<strong>Bulk Actions</strong><br/>Select multiple properties and use Actions to send a mass email, export to CSV, or add them all to the waiting list at once.' },
    { intro: '<strong>Pro tip!</strong><br/><br/>Add square footage to every property — it\'s used to calculate product amounts, route efficiency, and service pricing in package plans.' }
  ],

  estimateslist: [
    { intro: '<strong>Welcome to Estimates!</strong><br/><br/>Send professional quotes to your leads and clients. Once accepted, an estimate can be converted directly to an invoice.' },
    { element: '.btn-add', intro: '<strong>Add Estimate</strong><br/>Click here to build a new estimate. You\'ll select the client or lead, add service line items from your catalog, set pricing, and write a custom message.' },
    { element: '.filter-tabs', intro: '<strong>Status Filters</strong><br/>Switch between All, Draft, Sent, Accepted, and Declined estimates. <em>Accepted</em> estimates are ready to convert to invoices.' },
    { element: '.toolbar', intro: '<strong>Actions</strong><br/>Select estimates using the checkboxes and use Actions to delete or export. Click the ✉ Email button on any row to send it directly to the client.' },
    { element: '#total-pill', intro: '<strong>Total Value</strong><br/>Shows the combined dollar value of all estimates currently in view. Filter to <em>Sent</em> to see your outstanding quote pipeline.' },
    { element: '#est-tbody', intro: '<strong>Estimate Rows</strong><br/>Click any row to open the estimate. From there you can edit it, send it by email, mark it accepted, or convert it to an invoice in one click.' },
    { intro: '<strong>Tip!</strong><br/><br/>Set up an Estimate Email Template in Settings so every estimate you send looks professional and branded with your company info.' }
  ],

  texts: [
    { intro: '<strong>Welcome to Texts!</strong><br/><br/>Send and receive SMS messages directly with your clients from here. All conversations are stored and searchable.' },
    { element: '.convo-list', intro: '<strong>Conversation List</strong><br/>Every client conversation appears here on the left. The most recent message shows at the top. Click any conversation to open it.' },
    { element: '.right-panel', intro: '<strong>Message Thread</strong><br/>The full SMS conversation with the selected client. New inbound messages appear automatically every few seconds — no need to refresh.' },
    { element: '.biz-phone-bar', intro: '<strong>Your Business Phone</strong><br/>This shows your VoIP phone number that clients text. Click it to update your VoIP credentials in settings.' },
    { intro: '<strong>Sending a New Text</strong><br/><br/>Click the <em>Compose</em> button to start a new conversation with a client. Type their number or search by name — then send directly from here.' }
  ],

  productslist: [
    { intro: '<strong>Welcome to Products!</strong><br/><br/>This is your chemical product library — every pesticide, herbicide, or fertilizer you apply on the job. Let\'s walk through it.' },
    { element: '.btn-add', intro: '<strong>Add Product</strong><br/>Click here to add a new product. Enter the product name, EPA registration number, active ingredient, and application rate per 1,000 sq ft.' },
    { element: '.filter-tabs', intro: '<strong>Filter Tabs</strong><br/>Switch between All products or filter by category — Insecticide, Herbicide, Fertilizer, etc. Use this to quickly find a specific chemical.' },
    { element: '.toolbar', intro: '<strong>Actions</strong><br/>Select products using checkboxes and use Actions to delete or export. Products used in a mix will show a warning before deletion.' },
    { element: '#product-tbody', intro: '<strong>Product Rows</strong><br/>Click any row to edit the product details, update the application rate, or add safety notes. These details flow through to chemical tracking reports.' },
    { intro: '<strong>Why this matters</strong><br/><br/>Products here power your <em>Product Mixes</em>. A mix combines multiple products at specific rates. You must add products before you can build a mix.' }
  ],

  productmixeslist: [
    { intro: '<strong>Welcome to Product Mixes!</strong><br/><br/>Mixes are the custom spray formulas your techs use in the field — combinations of products at specific rates. Let\'s walk through this page.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Mix</strong><br/>Click here to create a new mix. Give it a name (e.g. "Mosquito Barrier"), then add the products and rates that make it up. Save it and it\'s available for field use.' },
    { element: '.toolbar', intro: '<strong>Actions</strong><br/>Select mixes using checkboxes and use Actions to delete or export. Click any row to edit an existing mix.' },
    { element: '#mix-tbody', intro: '<strong>Mix Rows</strong><br/>Each row is one spray mix. Click it to see what products are in it, update rates, or rename it. Mixes are selected by techs when completing a job on the mobile app.' },
    { intro: '<strong>How mixes connect to jobs</strong><br/><br/>When a technician marks a service complete on the mobile app, they select which mix was used and how much was applied. That data feeds your chemical tracking report.' }
  ],

  packageplans: [
    { intro: '<strong>Welcome to Package Plans!</strong><br/><br/>Packages bundle your services into a seasonal or recurring program that clients subscribe to. Let\'s walk through this page.' },
    { element: '.btn-add', intro: '<strong>Add Package</strong><br/>Click here to build a new package. Set the name, number of applications, price, and which services are included. Clients enroll in a package on their property profile.' },
    { element: '#pkg-tbody', intro: '<strong>Package Rows</strong><br/>Each row is one package plan. Click it to edit services, update pricing, or see which clients are enrolled. The subscriber count shows how many active properties are on the plan.' },
    { element: '.toolbar-tabs', intro: '<strong>Package Tabs</strong><br/>Switch between your active packages and any that have been retired. You can archive old plans without deleting them.' },
    { intro: '<strong>Important: how packages work</strong><br/><br/>When a client is on a package, their next service populates on the Waiting List automatically based on the interval you set. The service won\'t appear until the minimum days have passed since the last application.' }
  ],

  estimateserviceslist: [
    { intro: '<strong>Welcome to the Service Catalog!</strong><br/><br/>This is the list of services you offer — they become line items on estimates, invoices, and packages. Let\'s walk through it.' },
    { element: '.btn-add', intro: '<strong>Add Service</strong><br/>Click here to add a new service. Enter the service name, default price, and description. This is what clients see on their estimate.' },
    { element: '.toolbar-tabs', intro: '<strong>Service Type Tabs</strong><br/>Toggle between individual Services and Packages. Services are single-line items; packages are bundles you\'ve pre-built.' },
    { element: '#svc-tbody', intro: '<strong>Service Rows</strong><br/>Click any row to edit the service name, price, or description. Changes here update across all future estimates and packages that reference this service.' },
    { intro: '<strong>How the catalog connects</strong><br/><br/>Services here populate the line item dropdown when building an estimate. They also power Package Plans — you select services from this catalog when building a package.' }
  ],

  areatreatedlist: [
    { intro: '<strong>Welcome to Area Treated Types!</strong><br/><br/>These are the measurement labels used on property profiles — things like "Front Yard sq ft" or "Linear Feet of Barrier". Let\'s walk through this page.' },
    { element: '.btn-add', intro: '<strong>Add Type</strong><br/>Click here to add a custom area type. Give it a name and unit (sq ft, linear ft, units). It will appear as a measurable field on every property.' },
    { element: '#types-tbody', intro: '<strong>Area Type Rows</strong><br/>Each row is one measurement category. Click it to rename it or change the unit. These labels appear on property profiles and service records.' },
    { intro: '<strong>Why area types matter</strong><br/><br/>Accurate square footage per area lets you calculate how much product to mix and apply. The amounts feed directly into your chemical tracking report and help price services accurately.' }
  ],

  alerts: [
    { intro: '<strong>Welcome to Alerts!</strong><br/><br/>Alerts are automated SMS and email notifications sent to your clients based on service activity. Enable them here and edit the templates to customize the message.' },
    { element: '.section-label', intro: '<strong>Alert Categories</strong><br/>Alerts are grouped by type — Client Alerts (review requests), Service Alerts (scheduled, completed, skipped), Estimate Alerts, and Payment Alerts.' },
    { element: '.link-item', intro: '<strong>Each Alert Row</strong><br/>Click the arrow to open and edit the message template for that alert. The toggle switches on the right turn SMS and Email delivery on or off independently.' },
    { element: '.toggle-group', intro: '<strong>SMS & Email Toggles</strong><br/>Each alert can be sent via text, email, or both. Turn on only what you want. SMS requires your VoIP number to be set up in Settings first.' },
    { intro: '<strong>Set it and forget it</strong><br/><br/>Once enabled, alerts fire automatically — you don\'t have to do anything per-job. A review request goes out after service completion, reminders go out before appointments, etc.' }
  ],

  importlist: [
    { intro: '<strong>Welcome to Import!</strong><br/><br/>If you\'re switching from another platform, you can import your existing data directly instead of entering everything by hand. Select your previous platform to get started.' },
    { element: 'table', intro: '<strong>Service AutoPilot Import</strong><br/>Coming from Service AutoPilot? Click this row to run the SAP import. It brings over your clients, properties, services, products, and waiting list — so you can be up and running without losing your history.' },
    { intro: '<strong>Before you import</strong><br/><br/>Make sure you have your export file ready from your previous platform. The import will walk you through mapping your columns and previewing the data before anything is committed. If something looks wrong, you can cancel before saving.<br/><br/>More import sources are being added — if you need a different platform, reach out to support.' }
  ],

  reportslist: [
    { intro: '<strong>Welcome to Reports!</strong><br/><br/>Run business reports directly from here. Currently there are two reports — with more coming. Each one pulls live data from your account.' },
    { element: '.reports-grid', intro: '<strong>Sales Tax Report</strong><br/>Shows all taxable and non-taxable sales plus total tax collected for any date range you choose. Breaks down by invoice with line-item detail — exactly what you need to file your sales tax return or hand off to your accountant.<br/><br/><strong>Chemical Tracking Report</strong><br/>Shows every chemical application logged on completed services — product name, amount used, property, date, and tech. Required in many states for pesticide application records and available for any DOA audit.' },
    { intro: '<strong>How to run a report</strong><br/><br/>Click any report card or the <em>Run Report</em> button to open it. Inside you\'ll set your date range and any filters, then run it to see the results. Most reports can be exported to CSV for use in Excel or your accountant\'s software.' }
  ],

  mobileinstall: [
    { intro: '<strong>Get the Mobile App</strong><br/><br/>The mobile app is a Progressive Web App (PWA) — it installs directly to your tech\'s phone home screen from a browser. No App Store download required, and it gets updates automatically every time we push one.' },
    { intro: '<strong>iPhone / iPad (iOS)</strong><br/><br/>1. Open the app link in <strong>Safari</strong> — must be Safari, not Chrome<br/>2. Tap the <strong>Share button</strong> (box with arrow pointing up)<br/>3. Scroll and tap <strong>"Add to Home Screen"</strong><br/>4. Tap <strong>Add</strong> — the icon appears on the home screen<br/><br/>Once installed, it opens full screen just like a native app.' },
    { intro: '<strong>Android (Google)</strong><br/><br/>1. Open the app link in <strong>Chrome</strong><br/>2. Tap the <strong>3-dot menu</strong> in the top right<br/>3. Tap <strong>"Add to Home Screen"</strong><br/>4. Tap <strong>Add</strong><br/><br/>If it doesn\'t appear on the home screen, swipe up to open your app drawer and look for it there. Long press to drag it to the home screen.' },
    { intro: '<strong>Why we do it this way</strong><br/><br/>App Store submissions take 1–2 weeks to get approved. With a PWA, every update you see in the web app is instantly live on the mobile app too — no waiting, no manual updates, no version mismatches between your techs\' phones.' }
  ],

  customfields: [
    { intro: '<strong>Welcome to Custom Fields!</strong><br/><br/>Custom fields let you add your own data points to client and property records — anything specific to your business that isn\'t already built in.' },
    { element: '.btn-orange-filled', intro: '<strong>Add a Custom Field</strong><br/>Click here to create a new field. Give it a name (e.g. "Gate Code", "Dog on Property", "HOA Name", "Preferred Contact"), choose the field type (text, number, yes/no, dropdown), and select whether it appears on clients, properties, or both.' },
    { element: '#fields-tbody', intro: '<strong>Field Rows</strong><br/>Each row is one custom field. Click it to edit the name, type, or where it appears. Fields you create here show up on every client or property profile — your team fills them in when adding or editing records.' },
    { intro: '<strong>How custom fields are used</strong><br/><br/>Examples: a "Gate Code" field on properties so techs know how to get in. A "Dog on Property" yes/no so the tech is prepared. An "HOA Name" field for communities with access requirements. These show on the property profile in the mobile app so your techs always have the info they need at the job site.' }
  ],

  salestaxlist: [
    { intro: '<strong>Welcome to Sales Tax!</strong><br/><br/>Create the tax rates that get applied to your invoices. Once set up, you can assign a tax rate to a client and it will automatically calculate on every invoice you generate for them.' },
    { element: '.btn-add', intro: '<strong>Add a Tax Rate</strong><br/>Click here to create a new rate. Give it a name (e.g. "TX State Tax 8.25%"), enter the percentage, and save. You can create multiple rates for different jurisdictions if you work across county or state lines.' },
    { element: '#tax-tbody', intro: '<strong>Tax Rate Rows</strong><br/>Click any row to edit the name or rate. You can have as many tax rates as you need — one per jurisdiction. Each client is assigned a specific rate on their profile.' },
    { intro: '<strong>How it connects to invoices</strong><br/><br/>When you create an invoice, the tax rate is pulled from the client\'s profile automatically. The tax is calculated on the subtotal after any discounts are applied. Set your rates here before you start generating invoices.' }
  ],

  services: [
    { intro: '<strong>Welcome to Services!</strong><br/><br/>This is where you manage the specific service types your technicians perform in the field. There are two categories — choose which one you want to work with.' },
    { element: '#landing-view', intro: '<strong>Two Service Categories</strong><br/><strong>Package Services</strong> — services that are part of a recurring package plan. These populate on the Waiting List automatically based on the package interval.<br/><br/><strong>One Time Services</strong> — standalone services not tied to a package. Used when you schedule a single job outside of a recurring plan.' },
    { intro: '<strong>Package Services vs. One Time</strong><br/><br/>The key difference: Package Services drive your automated scheduling. When a client is enrolled in a package, the system checks the minimum days since their last service and puts the next one on the Waiting List when it\'s due.<br/><br/>One Time Services are manually scheduled — you pick the property, pick the service, and set the date.' },
    { intro: '<strong>How this connects to the Waiting List</strong><br/><br/>The service types you create here are what appear in the service dropdown when you add a property to the Waiting List. If a service isn\'t in this list, you can\'t schedule it. Build out your full service menu here first before scheduling jobs.' }
  ],

  invoiceemailsetup: [
    { intro: '<strong>Invoice Email Setup</strong><br/><br/>This is where you configure what your clients receive when you email them an invoice. There are two parts to set up — the template and the info.' },
    { element: '.link-card', intro: '<strong>Two settings to configure</strong><br/><strong>Invoice Email Template</strong> — choose the visual layout of your invoice email: header, colors, logo placement, and footer. Pick a template that matches your brand.<br/><br/><strong>Invoice Email Info</strong> — set the actual content: your sender name, subject line, body message, and any additional details like payment instructions or a thank-you note. This is what the client reads.' },
    { intro: '<strong>When does this email send?</strong><br/><br/>When you open an invoice and click the <em>Email</em> button, it uses exactly what you\'ve configured here. Set this up before you send your first invoice so every client gets a polished, professional message with your branding.' }
  ],

  estimateemailsetup: [
    { intro: '<strong>Estimate Email Setup</strong><br/><br/>This is where you configure everything related to the estimate flow — your services catalog, reusable templates, and the email your clients receive when you send them a quote.' },
    { element: '.link-card', intro: '<strong>Four things to set up here</strong><br/><strong>Estimate Services / Packages</strong> — the menu of services you offer. These become the line items on every estimate.<br/><br/><strong>Estimate Templates</strong> — pre-built estimates you can pull up and send in seconds for your common service combinations.<br/><br/><strong>Estimate Email Template</strong> — the visual layout of the email your client receives.<br/><br/><strong>Estimate Email Info</strong> — the subject, body text, and sender details your client sees in their inbox.' },
    { intro: '<strong>The flow from estimate to client</strong><br/><br/>You build an estimate from your services catalog → fill it out or load a template → click Email → the client receives a branded email with a link to view and accept the estimate online. Configure the template and info here first so every estimate looks sharp.' }
  ],

  emailalerttemplateslist: [
    { intro: '<strong>Alert Email Setup</strong><br/><br/>Alert emails are the automated notifications sent to clients when something happens — a service is scheduled, completed, an estimate is sent, a payment is due. This is where you control how those alerts look.' },
    { element: '.link-card', intro: '<strong>Two settings here</strong><br/><strong>Alert Email Template</strong> — the visual wrapper around all your alert emails: your logo, brand colors, header, and footer layout. Set this once and it applies to every alert type.<br/><br/><strong>Alert Email Info</strong> — customize the sender name, reply-to address, and any additional content that appears in your alert emails.' },
    { intro: '<strong>Where alerts are turned on</strong><br/><br/>This page only controls how the emails <em>look</em>. To turn specific alerts on or off — like the appointment reminder, completion notice, or review request — go to <strong>Alerts</strong> in the sidebar. Each alert type has its own SMS and email toggle there.' }
  ],

  tags: [
    { intro: '<strong>Welcome to Tags!</strong><br/><br/>Tags are labels you attach to clients, properties, and leads. They\'re one of the most powerful tools in the app — once you tag things, you can filter your entire Waiting List, Client List, and Property List by tag in one click.' },
    { element: '.btn-add', intro: '<strong>Add a Tag</strong><br/>Click here to create a new tag. Give it a short, clear name — "Mosquito", "Pest Control", "VIP", "Skip Notifications", "Back Yard Only". You can also group tags into categories.' },
    { element: '.toolbar-tabs', intro: '<strong>Tags vs. Tag Categories</strong><br/>The <em>Tags</em> tab shows individual tags. The <em>Categories</em> tab lets you group related tags together — for example a "Service Type" category with tags like Mosquito, Pest, Fertilizer. Categories keep your tag list organized as it grows.' },
    { element: '#tags-tbody', intro: '<strong>Tag Rows</strong><br/>Click any tag to rename it or change its category. You can also set a color so tags are visually distinct when they appear on client and property records.' },
    { intro: '<strong>How to use tags</strong><br/><br/>After creating tags here, go to any client or property profile and add tags to it. Then on the <strong>Waiting List</strong>, click the <em>Tags</em> filter tab — you can show only properties tagged "Mosquito" or "Pest Control" to build a service-specific route. Tags also filter the Client List and Properties List the same way.' }
  ],

  cancelreasons: [
    { intro: '<strong>Welcome to Cancellation Reasons!</strong><br/><br/>These are the preset reasons a client cancels a service or their account. Having standard reasons keeps your data consistent and lets you spot patterns over time.' },
    { element: '.btn-add', intro: '<strong>Add a Reason</strong><br/>Click here to add a cancellation reason — for example "Price Too High", "Moving", "Switched Providers", "Weather", "No Longer Needs Service". These appear as a dropdown when you cancel a service or close a client.' },
    { element: '#reasons-tbody', intro: '<strong>Reason Rows</strong><br/>Click any row to edit or rename a reason. Keep your list tight — too many options makes it harder to spot meaningful trends in why clients leave.' },
    { intro: '<strong>Why this matters</strong><br/><br/>When you cancel a service or mark a lead as lost, you\'ll be prompted to select a cancellation reason. Over time this data tells you whether you\'re losing business on price, service quality, geography, or seasonality — so you can make better business decisions.' }
  ],

  discounts: [
    { intro: '<strong>Welcome to Discounts!</strong><br/><br/>Create reusable discount codes and amounts here. Once set up, discounts can be applied to estimates and invoices to reduce the total owed by a flat amount or a percentage.' },
    { element: '.btn-add', intro: '<strong>Add a Discount</strong><br/>Click here to create a discount. Give it a name (e.g. "Referral — $20 Off", "New Customer 10%"), set whether it\'s a flat dollar amount or a percentage, and set the value.' },
    { element: '#main-tbody', intro: '<strong>Discount Rows</strong><br/>Each row is one discount option. Click it to edit the name or amount. Discounts you add here appear in the discount dropdown when building an estimate or invoice.' },
    { intro: '<strong>How discounts work</strong><br/><br/>When you open an estimate or invoice and add a discount, you select from this list. The amount is deducted from the subtotal before tax is calculated. You can apply multiple discounts to a single invoice if needed.' }
  ],

  trucks: [
    { intro: '<strong>Welcome to Trucks!</strong><br/><br/>Trucks are the core of how your mobile workflow runs. Every job on the Waiting List gets assigned to a truck when dispatched — and your technician only sees the jobs for <em>their</em> truck when they log into the mobile app.' },
    { element: '.btn-add', intro: '<strong>Add a Truck</strong><br/>Click here to add a truck or vehicle. Give it a clear name — "Truck 1", "Mosquito Van", "Route 2". This name is what your techs will see on their mobile device, so make it easy to recognize.' },
    { element: '#trucks-tbody', intro: '<strong>Your Truck List</strong><br/>Each row is one truck. Click it to rename it or deactivate it. Deactivating a truck removes it from dispatch without deleting its history.' },
    { intro: '<strong>How jobs get assigned to a truck</strong><br/><br/>Go to the <strong>Waiting List</strong> and select the properties you want to send out for the day. Check the boxes next to those properties, then click <em>Dispatch</em>. You\'ll choose which truck to assign them to — that moves them to the Scheduled List under that truck.' },
    { intro: '<strong>How the truck ties to your employee</strong><br/><br/>Go to <strong>Employees</strong> and assign your technician to that same truck. When the tech opens the mobile app and logs in, they automatically see the schedule for their assigned truck — every property dispatched to that truck for the day, in route order.<br/><br/>If a different tech is covering a route for the day, just go to Employees, open their profile, and assign the truck to them for <strong>24 hours</strong>. It disappears automatically after the day is done.' },
    { intro: '<strong>The full flow</strong><br/><br/><strong>1.</strong> Add trucks here<br/><strong>2.</strong> Assign a tech to each truck in Employees<br/><strong>3.</strong> On the Waiting List, select properties → Dispatch → pick the truck<br/><strong>4.</strong> Tech logs into mobile → sees their truck\'s schedule → marks jobs complete as they go' }
  ],

  employeehours: [
    { intro: '<strong>Welcome to Employee Hours!</strong><br/><br/>Track your technicians\' time here — clock-in, clock-out, lunch, and breaks. Every entry is logged per employee and per day so you have a complete time record.' },
    { element: '.btn-add', intro: '<strong>Add Entry</strong><br/>Click here to manually log a time entry for any employee. Select the employee, date, clock-in and clock-out times, and optional lunch and break windows. The total hours calculate automatically.' },
    { element: '.filter-bar', intro: '<strong>Filter by Employee &amp; Date</strong><br/>Use the employee dropdown to view one tech\'s hours or all at once. Set a From and To date to pull a specific pay period — this is what you\'ll use each week or biweekly to run payroll.' },
    { element: '#sum-hours', intro: '<strong>Total Hours</strong><br/>Shows the total hours worked by the selected employee across the selected date range. Adjust the date filter to match your pay period to get the exact hours to pay.' },
    { element: '.toolbar', intro: '<strong>Actions</strong><br/>Select entries with checkboxes and use Actions to delete a batch of entries. Use this to correct errors or remove duplicate clock-ins.' },
    { element: '#hours-tbody', intro: '<strong>Time Entry Rows</strong><br/>Each row is one day\'s time record. Click it to open and edit the entry — you can adjust clock-in, clock-out, lunch, or break times at any point.' },
    { intro: '<strong>How techs clock in</strong><br/><br/>Technicians clock in and out directly from the mobile app. Their entries appear here automatically — you don\'t need to add them manually unless you\'re correcting a missed punch.' }
  ],

  employeelist: [
    { intro: '<strong>Welcome to Employees!</strong><br/><br/>Manage your field technicians here. Assigning a truck to an employee controls what that tech sees when they log into the mobile app.' },
    { element: '.btn-add', intro: '<strong>Add Employee</strong><br/>Click here to add a technician. Enter their name, contact info, and assign them a truck. The truck assignment determines which route appears on their mobile device when they log in.' },
    { element: '#emp-tbody', intro: '<strong>Employee Rows</strong><br/>Each row is one employee. The <em>Assigned Truck</em> column shows their current truck. If the assignment has an expiry, the date shows next to the truck name.' },
    { intro: '<strong>How Truck Assignment Works</strong><br/><br/>When an employee logs into the mobile app, it pulls up the schedule for their assigned truck. If you need a different tech to run a truck for the day, open that employee and add the truck to their account.<br/><br/>You can assign a truck <strong>permanently</strong>, for <strong>24 hours</strong>, or for a <strong>full week (7 days)</strong>. After the time limit expires, the truck automatically disappears from that employee so you don\'t have to remember to remove it.' },
    { element: '.toolbar-tabs', intro: '<strong>Active / Inactive Filter</strong><br/>Switch between Active and Inactive employees. Deactivating an employee removes them from the mobile login without deleting their history.' }
  ],

  payments: [
    { intro: '<strong>Welcome to Payments!</strong><br/><br/>Track all money received from clients here — payments are applied against invoices to reduce the balance owed.' },
    { element: '.btn-orange-filled', intro: '<strong>Add Payment</strong><br/>Click here to record a payment from a client. Select the invoice it applies to, enter the amount, payment method, and date.' },
    { element: '.toolbar', intro: '<strong>Actions & Page Size</strong><br/>Select payments with checkboxes and use <em>Actions</em> to delete or export. Increase the page size to see more rows at once.' },
    { element: '#payment-tbody', intro: '<strong>Payment Rows</strong><br/>Each row is one payment record. Click it to view or edit the details — amount, date, method, and which invoice it\'s applied to.' },
    { element: '#total-amount', intro: '<strong>Totals Row</strong><br/>Shows the total collected, any unused credit, and total refunded for all payments in the current view. Filter by date to see a specific period\'s collections.' },
    { intro: '<strong>Tip!</strong><br/><br/>Payments flow from here to your invoice balances. Once a payment is applied, the invoice status updates to Paid automatically.' }
  ],

  settings: [
    { intro: '<strong>Welcome to Settings!</strong><br/><br/>Everything about how your account is configured lives here. Let\'s take a quick tour of what you can find.' },
    { element: '#search-input', intro: '<strong>Search Settings</strong><br/>Type any keyword to instantly filter the settings list. Search "tax", "email", "alerts" — whatever you need — and only relevant settings show.' },
    { element: '#group-company', intro: '<strong>Company Settings</strong><br/>Set your company name, logo, address, and timezone. Manage users, roles, employees, and your truck/vehicle list. Start here when setting up a new account.' },
    { element: '#group-emails', intro: '<strong>Email Templates</strong><br/>Customize the emails your clients receive — invoice emails, estimate emails, and alert email templates. Upload your logo and personalize the message.' },
    { element: '#group-services', intro: '<strong>Services & Packages</strong><br/>Manage your service catalog and package plans from here. These are the core items that flow through to estimates, invoices, and the waiting list.' },
    { element: '#group-chemical', intro: '<strong>Chemical Settings</strong><br/>Add and manage the products you apply and the mixes your techs use. Required for chemical tracking reports and compliance.' },
    { intro: '<strong>Pro tip!</strong><br/><br/>Walk through the Setup Guide (also in Settings) for a step-by-step checklist of everything to configure before going live. It tracks your progress automatically.' }
  ]

};

/* ── Start a tour ── */
function startTour(pageKey) {
  var steps = TOUR_STEPS[pageKey];
  if (!steps) return;

  var intro = introJs().setOptions({
    steps: steps,
    showProgress: true,
    showBullets: false,
    exitOnOverlayClick: true,
    nextLabel: 'Next ›',
    prevLabel: '‹ Back',
    doneLabel: 'Done',
    tooltipClass: 'sbp-tour',
    highlightClass: 'sbp-highlight',
    scrollToElement: true,
    scrollPadding: 80
  });

  intro.onafterchange(function() {
    setTimeout(function() {
      var old = document.querySelector('.tour-dismiss-wrap');
      if (old) old.remove();
      var tooltip = document.querySelector('.introjs-tooltip');
      if (!tooltip) return;
      var wrap = document.createElement('div');
      wrap.className = 'tour-dismiss-wrap';
      wrap.style.cssText = 'text-align:center;padding:5px 12px 9px;border-top:1px solid #f0f0f0;margin-top:2px;';
      var a = document.createElement('a');
      a.href = '#';
      a.style.cssText = 'font-size:11px;color:#bbb;text-decoration:none;border-bottom:1px dotted #bbb;';
      a.textContent = "Don't show again";
      a.addEventListener('click', function(e) {
        e.preventDefault();
        intro.exit(true);
        _tDismiss(pageKey);
      });
      wrap.appendChild(a);
      tooltip.appendChild(wrap);
    }, 80);
  });

  intro.start();
}
