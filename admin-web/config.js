window.GOY_ADMIN_CONFIG = {
  mode: 'api',
  apiBaseUrl: '/api',
  registrationBaseUrl: `${window.location.origin}/registro`
};

window.addEventListener('load',()=>{
  if(!document.querySelector('script[data-goy-sound]')){
    const sound=document.createElement('script');
    sound.src='/admin/goy-sound.js';
    sound.dataset.goySound='1';
    document.body.appendChild(sound);
  }

  if(!document.querySelector('script[data-account-approvals]')){
    const approvals=document.createElement('script');
    approvals.src='/admin/account-approvals.js';
    approvals.dataset.accountApprovals='1';
    document.body.appendChild(approvals);
  }
});
