import { withSupabase } from '@supabase/server'

type CreateAdvisorBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string | null
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json(
        {
          error: 'Método no permitido',
        },
        { status: 405 }
      )
    }

    let body: CreateAdvisorBody

    try {
      body = await req.json()
    } catch {
      return Response.json(
        {
          error: 'El cuerpo de la solicitud no contiene JSON válido',
        },
        { status: 400 }
      )
    }

    const email = body.email?.trim().toLowerCase()
    const password = body.password
    const fullName = body.full_name?.trim()
    const phone = body.phone?.trim() || null

    if (!email) {
      return Response.json(
        {
          error: 'El correo electrónico es obligatorio',
        },
        { status: 400 }
      )
    }

    if (!password) {
      return Response.json(
        {
          error: 'La contraseña es obligatoria',
        },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return Response.json(
        {
          error: 'La contraseña debe tener al menos 8 caracteres',
        },
        { status: 400 }
      )
    }

    if (!fullName) {
      return Response.json(
        {
          error: 'El nombre completo es obligatorio',
        },
        { status: 400 }
      )
    }

    /*
     * ctx.supabase:
     * Cliente autenticado como el usuario que hizo la petición.
     *
     * ctx.supabaseAdmin:
     * Cliente privilegiado para operaciones administrativas.
     */

    const { data: currentProfile, error: profileError } =
      await ctx.supabase
        .from('profiles')
        .select('id, full_name, role, active')
        .eq('id', ctx.userClaims?.id)
        .maybeSingle()

    if (profileError) {
      return Response.json(
        {
          error: 'No se pudo verificar el perfil del administrador',
          details: profileError.message,
        },
        { status: 500 }
      )
    }

    if (!currentProfile || currentProfile.role !== 'admin') {
      return Response.json(
        {
          error: 'Solo un administrador puede crear asesores',
        },
        { status: 403 }
      )
    }

    /*
     * Crear usuario en Supabase Auth.
     *
     * Esta operación ocurre exclusivamente con el cliente
     * privilegiado dentro de la Edge Function.
     */
    const {
      data: authData,
      error: authError,
    } = await ctx.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (authError || !authData.user) {
      return Response.json(
        {
          error: 'No se pudo crear la cuenta del asesor',
          details: authError?.message ?? 'Usuario no creado',
        },
        { status: 400 }
      )
    }

    const newUserId = authData.user.id

    /*
     * Ahora utilizamos el cliente autenticado de Victoria
     * para ejecutar la función SQL 9B.
     *
     * Así create_advisor_profile() puede comprobar
     * correctamente que quien la ejecuta es admin.
     */
    const {
      data: advisorId,
      error: advisorError,
    } = await ctx.supabase.rpc('create_advisor_profile', {
      p_user_id: newUserId,
      p_email: email,
      p_full_name: fullName,
      p_phone: phone,
    })

    /*
     * Si falló la creación del profile/advisor,
     * eliminamos el usuario Auth que acabamos de crear
     * para evitar cuentas incompletas.
     */
    if (advisorError || !advisorId) {
      await ctx.supabaseAdmin.auth.admin.deleteUser(newUserId)

      return Response.json(
        {
          error: 'No se pudo completar el registro del asesor',
          details:
            advisorError?.message ??
            'No se creó correctamente el advisor',
        },
        { status: 500 }
      )
    }

    return Response.json(
      {
        success: true,
        advisor_id: advisorId,
        user_id: newUserId,
        email,
        full_name: fullName,
        phone,
      },
      { status: 201 }
    )
  }),
}