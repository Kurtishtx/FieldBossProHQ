// Correct Supabase client initialization
const client = supabase.createClient(
  "https://knjdbgroiyhvqwrpqzcx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuamRiZ3JvaXlodnF3cnBxemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTczMDMsImV4cCI6MjA5NTA3MzMwM30.zoExtkem-XZqU86S4yJjA_xOOaS1G0IPU2M9OAAza2g",
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
);

// Auto-redirect if already logged in and stay-logged-in was checked
(async function() {
  if (localStorage.getItem('sbp_stay_logged_in') !== '1') return;
  // refreshSession uses the stored refresh token to get a new access token even after browser restart
  var { data } = await client.auth.refreshSession();
  if (data && data.session) {
    sessionStorage.setItem('sbp_session_active', '1');
    window.location.href = 'dashboard.html';
  }
})();

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
    return;
  }

  // Check role, product, and trial
  var userId = data.user.id;
  var { data: prof } = await client.from('user_profiles').select('role, trial_ends_at, product').eq('id', userId).single();

  // Block mobile-only accounts
  if (prof && prof.role === 'mobile') {
    await client.auth.signOut();
    alert('This account is for the mobile app only. Please use the SprayBossPro mobile app to log in.');
    return;
  }

  // Block accounts that belong to a different product
  if (prof && prof.product && prof.product !== 'spraybosspro') {
    await client.auth.signOut();
    alert('This account is not registered for SprayBossPro. Please log in at the correct software.');
    return;
  }

  // Check trial expiry
  if (prof && prof.trial_ends_at && new Date(prof.trial_ends_at) < new Date()) {
    var { data: acct } = await client.from('platform_accounts').select('active').eq('user_id', userId).single();
    if (!acct || !acct.active) {
      var screen = document.getElementById('trial-expired-screen');
      if (screen) {
        screen.style.display = 'flex';
        if (typeof initTrialCardForm === 'function') initTrialCardForm(userId);
      }
      return;
    }
  }

  var stayLoggedIn = document.getElementById('stay-logged-in').checked;
  localStorage.setItem('sbp_stay_logged_in', stayLoggedIn ? '1' : '0');
  sessionStorage.setItem('sbp_session_active', '1');

  window.location.href = "dashboard.html";
}

function showForgot(e) {
  e.preventDefault();
  var modal = document.getElementById('forgot-modal');
  modal.style.display = 'flex';
  document.getElementById('forgot-email').value = document.getElementById('email').value || '';
  document.getElementById('forgot-msg').style.display = 'none';
}

function hideForgot(e) {
  if (e) e.preventDefault();
  document.getElementById('forgot-modal').style.display = 'none';
}

async function sendReset() {
  var email = document.getElementById('forgot-email').value.trim();
  if (!email) { alert('Please enter your email.'); return; }
  var { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password.html'
  });
  var msg = document.getElementById('forgot-msg');
  msg.style.display = 'block';
  if (error) {
    msg.style.color = '#cc2222';
    msg.textContent = error.message;
  } else {
    msg.style.color = '#2a7a2a';
    msg.textContent = 'Check your email for a reset link!';
  }
}
