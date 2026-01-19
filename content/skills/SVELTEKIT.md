# SvelteKit Best Practices (2025)

## Stack Overview
- **SvelteKit 2** - Full-stack framework
- **Svelte 5** - Component framework with runes
- **TypeScript** - Strict mode
- **Tailwind CSS v4** - Utility-first CSS
- **shadcn-svelte** - UI component library

## Svelte 5 Runes

### $state - Reactive State
```svelte
<script lang="ts">
  // Simple state
  let count = $state(0);
  
  // Object state (deeply reactive)
  let user = $state({ name: 'Alice', age: 30 });
  
  // Array state
  let items = $state<string[]>([]);
</script>

<button onclick={() => count++}>
  Count: {count}
</button>
```

### $derived - Computed Values
```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  let isEven = $derived(count % 2 === 0);
  
  // Complex derived (with block)
  let summary = $derived.by(() => {
    if (count === 0) return 'Zero';
    if (count < 10) return 'Small';
    return 'Large';
  });
</script>
```

### $effect - Side Effects
```svelte
<script lang="ts">
  let count = $state(0);
  
  // Runs when count changes
  $effect(() => {
    console.log('Count is now:', count);
    
    // Optional cleanup (returned function)
    return () => {
      console.log('Cleaning up for:', count);
    };
  });
  
  // Pre-effect (runs before DOM updates)
  $effect.pre(() => {
    console.log('About to update DOM');
  });
</script>
```

### $props - Component Props
```svelte
<script lang="ts">
  // With types
  let { name, age = 18, onSave } = $props<{
    name: string;
    age?: number;
    onSave: (data: { name: string }) => void;
  }>();
  
  // With $bindable for two-way binding
  let { value = $bindable() } = $props<{ value?: string }>();
</script>
```

### $bindable - Two-Way Binding
```svelte
<!-- Parent.svelte -->
<script lang="ts">
  let text = $state('');
</script>

<Input bind:value={text} />

<!-- Input.svelte -->
<script lang="ts">
  let { value = $bindable('') } = $props<{ value?: string }>();
</script>

<input bind:value={value} />
```

## SvelteKit Routing

### File-Based Routing
```
src/routes/
├── +page.svelte              # /
├── +layout.svelte            # Root layout
├── +error.svelte             # Error page
├── about/
│   └── +page.svelte          # /about
├── blog/
│   ├── +page.svelte          # /blog
│   ├── +page.server.ts       # Server load
│   └── [slug]/
│       ├── +page.svelte      # /blog/:slug
│       └── +page.server.ts
├── api/
│   └── users/
│       └── +server.ts        # /api/users
└── (auth)/                   # Route group (no URL segment)
    ├── login/
    │   └── +page.svelte      # /login
    └── register/
        └── +page.svelte      # /register
```

### Load Functions
```typescript
// +page.server.ts
import type { PageServerLoad } from './$types';
import { getConvexClient } from '$lib/convex';
import { api } from '$convex/_generated/api';

export const load: PageServerLoad = async ({ params, locals }) => {
  const convex = getConvexClient();
  
  const [user, posts] = await Promise.all([
    convex.query(api.users.getById, { id: params.id }),
    convex.query(api.posts.listByAuthor, { authorId: params.id }),
  ]);
  
  return { user, posts };
};
```

### Form Actions
```typescript
// +page.server.ts
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { getConvexClient } from '$lib/convex';
import { api } from '$convex/_generated/api';

export const actions: Actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const title = data.get('title')?.toString();
    const content = data.get('content')?.toString();
    
    if (!title || !content) {
      return fail(400, { 
        error: 'Title and content are required',
        values: { title, content }
      });
    }
    
    const convex = getConvexClient();
    const id = await convex.mutation(api.posts.create, { title, content });
    
    throw redirect(303, `/posts/${id}`);
  },
  
  delete: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id')?.toString();
    
    if (!id) {
      return fail(400, { error: 'ID is required' });
    }
    
    const convex = getConvexClient();
    await convex.mutation(api.posts.remove, { id });
    
    return { success: true };
  },
};
```

### Using Form Actions in Components
```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  
  let { form } = $props();
</script>

<form method="POST" action="?/create" use:enhance>
  {#if form?.error}
    <p class="text-red-500">{form.error}</p>
  {/if}
  
  <input 
    name="title" 
    value={form?.values?.title ?? ''} 
    placeholder="Title"
  />
  <textarea name="content" placeholder="Content"></textarea>
  
  <button type="submit">Create Post</button>
</form>
```

### API Routes
```typescript
// src/routes/api/webhook/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { getConvexClient } from '$lib/convex';
import { api } from '$convex/_generated/api';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  
  // Validate webhook signature
  const signature = request.headers.get('x-webhook-signature');
  if (!validateSignature(signature, body)) {
    throw error(401, 'Invalid signature');
  }
  
  const convex = getConvexClient();
  await convex.mutation(api.webhooks.process, { data: body });
  
  return json({ received: true });
};
```

## Real-Time with Convex

### Setting Up Convex Client
```typescript
// src/lib/convex.ts
import { ConvexHttpClient } from 'convex/browser';

let client: ConvexHttpClient | null = null;

export function getConvexClient() {
  if (!client) {
    client = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
  }
  return client;
}
```

### Real-Time Subscriptions (Client-Side)
```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { useQuery, useMutation } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  
  // Real-time query (auto-updates)
  const users = useQuery(api.users.list, {});
  
  // Mutation
  const createUser = useMutation(api.users.create);
  
  async function handleCreate() {
    await createUser({ name: 'New User', email: 'new@example.com' });
    // No need to refetch - real-time updates automatically
  }
</script>

{#if $users.isLoading}
  <p>Loading...</p>
{:else if $users.error}
  <p class="text-red-500">Error: {$users.error.message}</p>
{:else}
  <ul>
    {#each $users.data ?? [] as user}
      <li>{user.name}</li>
    {/each}
  </ul>
{/if}

<button onclick={handleCreate}>Add User</button>
```

## Error Handling

### +error.svelte
```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <h1>{$page.status}</h1>
  <p>{$page.error?.message ?? 'An error occurred'}</p>
  <a href="/">Go home</a>
</div>
```

### Throwing Errors
```typescript
// +page.server.ts
import { error } from '@sveltejs/kit';

export const load = async ({ params }) => {
  const user = await getUser(params.id);
  
  if (!user) {
    throw error(404, {
      message: 'User not found',
      code: 'USER_NOT_FOUND',
    });
  }
  
  return { user };
};
```

## Environment Variables

```bash
# .env
VITE_CONVEX_URL=https://xxx.convex.cloud

# Private (server only)
CONVEX_DEPLOY_KEY=xxx
RESEND_API_KEY=xxx
```

```typescript
// Access in server code
const key = process.env.RESEND_API_KEY;

// Access in client code (VITE_ prefix required)
const url = import.meta.env.VITE_CONVEX_URL;
```

## Best Practices Summary

1. **Always use Svelte 5 runes** - $state, $derived, $effect, $props
2. **Load data server-side** - Use +page.server.ts for initial data
3. **Use form actions** - For mutations with progressive enhancement
4. **Real-time for live data** - Use convex-svelte for subscriptions
5. **Type everything** - Use TypeScript strict mode
6. **Handle errors gracefully** - Use +error.svelte and try/catch
7. **Keep components small** - Extract reusable components
