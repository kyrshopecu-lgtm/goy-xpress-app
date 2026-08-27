window.GOY_ADMIN_CONFIG = {
  mode: 'api',
  apiBaseUrl: '/api',
  registrationBaseUrl: `${window.location.origin}/registro`
};

window.addEventListener('load',()=>{
  if(document.querySelector('script[data-account-approvals]'))return;
  const script=document.createElement('script');
  script.src='/admin/account-approvals.js';
  script.dataset.accountApprovals='1';
  document.body.appendChild(script);
});
