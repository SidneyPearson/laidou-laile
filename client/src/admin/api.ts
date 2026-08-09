import axios from 'axios'
import type { AdminCity, AdminHomePersona, AdminSpot, DashboardStats, Page, RefreshDueResponse, RefreshPreview, RefreshRunDetail } from './types'

export class AdminApiError extends Error { constructor(public code:string,message:string,public details?:unknown){super(message)} }
const adminApi=axios.create({baseURL:'/api/admin',timeout:15000,withCredentials:true,headers:{'Content-Type':'application/json'}})
adminApi.interceptors.response.use(response=>response,error=>{const payload=error.response?.data?.error;if(error.response?.status===401&&typeof window!=='undefined'){window.dispatchEvent(new Event('admin-auth-expired'));if(!window.location.hash.includes('/admin/login'))window.location.hash='#/admin/login'}return Promise.reject(new AdminApiError(payload?.code??'NETWORK_ERROR',payload?.message??'请求失败',payload?.details))})
export async function adminMe(){return (await adminApi.get<{authenticated:boolean}>('/auth/me')).data}
export async function adminLogin(password:string){return (await adminApi.post('/auth/login',{password})).data}
export async function adminLogout(){return (await adminApi.post('/auth/logout')).data}
export async function dashboard(){return (await adminApi.get<DashboardStats>('/dashboard')).data}
export async function listCities(params:Record<string,unknown>={}){return (await adminApi.get<Page<AdminCity>>('/cities',{params})).data}
export async function createCity(data:unknown){return (await adminApi.post<AdminCity>('/cities',data)).data}
export async function updateCity(adcode:string,data:unknown){return (await adminApi.patch<AdminCity>(`/cities/${adcode}`,data)).data}
export async function listSpots(params:Record<string,unknown>={}){return (await adminApi.get<Page<AdminSpot>>('/spots',{params})).data}
export async function getSpot(id:string){return (await adminApi.get<AdminSpot>(`/spots/${id}`)).data}
export async function createSpot(data:unknown){return (await adminApi.post<AdminSpot>('/spots',data)).data}
export async function updateSpot(id:string,data:unknown){return (await adminApi.patch<AdminSpot>(`/spots/${id}`,data)).data}
export async function verifySpot(id:string,expectedVersion:number){return (await adminApi.post(`/spots/${id}/verify`,{expectedVersion})).data}
export async function publishSpot(id:string,expectedVersion:number){return (await adminApi.post<AdminSpot>(`/spots/${id}/publish`,{expectedVersion})).data}
export async function unpublishSpot(id:string,expectedVersion:number){return (await adminApi.post<AdminSpot>(`/spots/${id}/unpublish`,{expectedVersion})).data}
export async function deleteSpot(id:string,expectedVersion:number){return (await adminApi.delete(`/spots/${id}`,{data:{expectedVersion}})).data}
export async function batchPublish(spots:Array<{id:string;expectedVersion:number}>){return (await adminApi.post('/spots/batch-publish',{spots})).data}
export async function listHomePersonas(){return (await adminApi.get<{items:AdminHomePersona[];total:number}>('/home-personas')).data.items}
export async function updateHomePersona(id:string,data:{title?:string;subtitle?:string|null;imageUrl?:string|null;sortOrder?:number;enabled?:boolean;expectedVersion:number}){return (await adminApi.patch<AdminHomePersona>(`/home-personas/${id}`,data)).data}
export async function refreshDue(){return (await adminApi.get<RefreshDueResponse>('/city-refresh/due')).data}
export async function startCityRefresh(adcode:string){return (await adminApi.post(`/cities/${adcode}/refresh-runs`,{})).data}
export async function getRefreshRun(runId:string){return (await adminApi.get<RefreshRunDetail>(`/refresh-runs/${runId}`)).data}
export async function getRefreshPrompt(runId:string){return (await adminApi.get(`/refresh-runs/${runId}/prompt`)).data}
export async function previewRefreshImport(runId:string,rawJson:string){return (await adminApi.post<RefreshPreview>(`/refresh-runs/${runId}/import-preview`,{rawJson})).data}
export async function confirmRefreshImport(runId:string,rawJson:string,previewHash:string){return (await adminApi.post(`/refresh-runs/${runId}/import-confirm`,{rawJson,previewHash})).data}
export async function confirmNoMaterialChange(runId:string,note?:string){return (await adminApi.post(`/refresh-runs/${runId}/confirm-no-change`,{confirmed:true,note:note||null})).data}
export async function verifyRefreshCandidate(candidateId:string){return (await adminApi.post(`/refresh-candidates/${candidateId}/verify`,{})).data}
export async function acceptRefreshCandidate(candidateId:string,data:unknown){return (await adminApi.post(`/refresh-candidates/${candidateId}/accept`,data)).data}
export async function rejectRefreshCandidate(candidateId:string,note?:string){return (await adminApi.post(`/refresh-candidates/${candidateId}/reject`,{note:note||null})).data}
export async function ignoreRefreshCandidate(candidateId:string,note?:string){return (await adminApi.post(`/refresh-candidates/${candidateId}/ignore`,{note:note||null})).data}
export async function completeRefreshRun(runId:string){return (await adminApi.post(`/refresh-runs/${runId}/complete`,{})).data}
export async function cancelRefreshRun(runId:string){return (await adminApi.post(`/refresh-runs/${runId}/cancel`,{})).data}
