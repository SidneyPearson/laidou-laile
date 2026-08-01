import { ref } from 'vue'
import { adminLogin, adminLogout, adminMe } from './api'

const authenticated=ref(false)
const checked=ref(false)
if (typeof window !== 'undefined') window.addEventListener('admin-auth-expired', () => {
  authenticated.value = false
  checked.value = true
})
export function useAdminAuth(){
  async function check(){try{authenticated.value=(await adminMe()).authenticated}catch{authenticated.value=false}finally{checked.value=true}return authenticated.value}
  async function login(password:string){await adminLogin(password);authenticated.value=true;checked.value=true}
  async function logout(){try{await adminLogout()}finally{authenticated.value=false;checked.value=true}}
  return {authenticated,checked,check,login,logout}
}
