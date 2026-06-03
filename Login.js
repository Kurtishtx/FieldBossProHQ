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

  window.location.href = "dashboard.html";
}
