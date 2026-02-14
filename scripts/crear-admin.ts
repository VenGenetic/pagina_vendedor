const { createClient } = require('@supabase/supabase-js')

const urlSupabase = 'https://vfemkaighftkqyoaxxpa.supabase.co'
const claveAnonSupabase = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZW1rYWlnaGZ0a3F5b2F4eHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNzgxOTYsImV4cCI6MjA4NDk1NDE5Nn0.TMfzsCd33vMBDHH4ZjCmQ1csAHVULvu_QFVSeOxpBrk'

const supabase = createClient(urlSupabase, claveAnonSupabase)

async function crearAdmin() {
  console.log('🔄 Creando administrador...')
  
  try {
    // 1. Crear usuario en auth
    const { data: datosAuth, error: errorAuth } = await supabase.auth.signUp({
      email: 'fernando18avila.es@gmail.com',
      password: 'Avila123fernando',
      options: {
        data: {
          full_name: 'Fernando',
        },
      },
    })

    if (errorAuth) {
      console.log('❌ Error al crear usuario:', errorAuth.message)
      process.exit(1)
    }

    console.log('✅ Usuario creado en auth.users')
    console.log('🔑 User ID:', datosAuth.user?.id)

    // 2. Crear perfil en tabla admins
    const { data: datosAdmin, error: errorAdmin } = await supabase
      .from('admins')
      .insert({
        auth_id: datosAuth.user?.id,
        email: 'fernando18avila.es@gmail.com',
        full_name: 'Fernando',
        is_active: true,
      })
      .select()
      .single()

    if (errorAdmin) {
      console.log('❌ Error al crear perfil admin:', errorAdmin.message)
      process.exit(1)
    }

    console.log('✅ Administrador creado exitosamente!')
    console.log('📧 Email: fernando18avila.es@gmail.com')
    console.log('👤 Nombre: Fernando')
    
  } catch (error) {
    console.log('❌ Error:', error)
  }
  
  process.exit(0)
}

crearAdmin()
