// Correct Supabase client initialization
const client = supabase.createClient(
  "https://knjdbgroiyhvqwrpqzcx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuamRiZ3JvaXlodnF3cnBxemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTczMDMsImV4cCI6MjA5NTA3MzMwM30.zoExtkem-XZqU86S4yJjA_xOOaS1G0IPU2M9OAAza2g"
);

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

  // Check role — Mobile Users cannot access the web app
  var userId = data.user.id;
  var { data: prof } = await client.from('user_profiles').select('role').eq('id', userId).single();
  if (prof && prof.role === 'mobile') {
    await client.auth.signOut();
    alert('This account is for the mobile app only. Please use the SprayBossPro mobile app to log in.');
    return;
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
