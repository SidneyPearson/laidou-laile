import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import { useAdminAuth } from '../admin/auth'

export const router = createRouter({
  history: createWebHashHistory(),
  // 新页面从顶部开始；只有浏览器返回/前进时恢复历史滚动位置。
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.fullPath !== from.fullPath) return { top: 0, left: 0 }
    return undefined
  },
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/explore', name: 'explore', component: () => import('../pages/ExplorePage.vue') },
    { path: '/city', name: 'city-explore', component: () => import('../pages/CityExplorePage.vue') },
    { path: '/today', name: 'today-plan', component: () => import('../pages/TodayPlanPage.vue') },
    { path: '/favorites', name: 'favorites', component: () => import('../pages/FavoritesPage.vue') },
    { path: '/me', name: 'me', component: () => import('../pages/MePage.vue') },
    { path: '/admin/login', name: 'admin-login', component: () => import('../pages/admin/AdminLoginPage.vue') },
    {
      path: '/admin', component: () => import('../layouts/AdminLayout.vue'), meta: { requiresAdmin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('../pages/admin/AdminDashboardPage.vue') },
        { path: 'cities', name: 'admin-cities', component: () => import('../pages/admin/AdminCitiesPage.vue') },
        { path: 'cities/:adcode/refresh', name: 'admin-city-refresh-start', component: () => import('../pages/admin/AdminCityRefreshPage.vue') },
        { path: 'refresh-runs/:runId', name: 'admin-city-refresh', component: () => import('../pages/admin/AdminCityRefreshPage.vue') },
        { path: 'spots', name: 'admin-spots', component: () => import('../pages/admin/AdminSpotsPage.vue') },
        { path: 'spots/new', name: 'admin-spot-new', component: () => import('../pages/admin/AdminSpotEditPage.vue') },
        { path: 'spots/:id', name: 'admin-spot-edit', component: () => import('../pages/admin/AdminSpotEditPage.vue') },
        { path: 'personas', name: 'admin-personas', component: () => import('../pages/admin/AdminPersonasPage.vue') },
      ],
    },
  ],
})

router.beforeEach(async to => {
  if (!to.meta.requiresAdmin) return true
  const auth = useAdminAuth()
  if (!auth.checked.value && !await auth.check()) return { name: 'admin-login', query: { redirect: to.fullPath } }
  if (!auth.authenticated.value) return { name: 'admin-login', query: { redirect: to.fullPath } }
  return true
})
