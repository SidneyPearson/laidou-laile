import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import HomePage from './pages/HomePage.vue'
import RoutePage from './pages/RoutePage.vue'
import './assets/styles/main.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/routes', name: 'routes', component: RoutePage },
  ],
})

const app = createApp(App)
app.use(router)
app.mount('#app')
