import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Banner, Button, Field, inputClass } from '../components/ui';
import { PublicNav } from './PublicPages';

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  password,
  organizationName: z.string().trim().min(1, 'Organization name is required'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export function RegisterPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const form = useForm({ resolver: zodResolver(registerSchema) });

  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(values) {
    setError('');
    try {
      const result = await api('/api/auth/register', { method: 'POST', body: values });
      signIn(result.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PublicNav />
      <main className="mx-auto max-w-md px-6 py-8">
        <h1 className="text-3xl font-semibold">Create your organization</h1>
        <p className="mt-2 text-sm text-muted">You will be the owner. One company, one tenant.</p>
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Banner>{error}</Banner>
          <Field label="Your name" error={form.formState.errors.name?.message}>
            <input className={inputClass} {...form.register('name')} />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <input className={inputClass} type="email" {...form.register('email')} />
          </Field>
          <Field label="Password" error={form.formState.errors.password?.message}>
            <input className={inputClass} type="password" {...form.register('password')} />
          </Field>
          <Field label="Organization" error={form.formState.errors.organizationName?.message}>
            <input className={inputClass} {...form.register('organizationName')} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Create account
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already registered? <Link to="/login" className="text-signal">Log in</Link>
        </p>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { token, signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const form = useForm({ resolver: zodResolver(loginSchema) });

  if (token) return <Navigate to="/dashboard" replace />;

  async function onSubmit(values) {
    setError('');
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: values });
      signIn(result.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <PublicNav />
      <main className="mx-auto max-w-md px-6 py-8">
        <h1 className="text-3xl font-semibold">Log in</h1>
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Banner>{error}</Banner>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <input className={inputClass} type="email" {...form.register('email')} />
          </Field>
          <Field label="Password" error={form.formState.errors.password?.message}>
            <input className={inputClass} type="password" {...form.register('password')} />
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Log in
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">
          New organization? <Link to="/register" className="text-signal">Register</Link>
        </p>
      </main>
    </div>
  );
}
