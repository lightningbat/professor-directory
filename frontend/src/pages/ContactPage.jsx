import { useEffect, useState } from 'react';
import { Pencil, Eraser } from '../components/Decor.jsx';
import Header from '../components/Header.jsx';
import { CheckIcon } from '../components/icons.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

// Web3Forms access keys are meant to be public (they're only allowed to send to your inbox).
// Get one at https://web3forms.com and put it in .env as VITE_WEB3FORMS_ACCESS_KEY.
const ENDPOINT = 'https://api.web3forms.com/submit';
const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;

const TOPICS = ['Feedback', 'Question', 'Idea'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { name: '', email: '', topic: TOPICS[0], message: '', botcheck: false };

function validate({ name, email, message }) {
	const errors = {};
	if (!name.trim()) errors.name = 'Please tell us your name.';
	if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
	if (message.trim().length < 10) errors.message = 'Please write at least a few words (10+ characters).';
	return errors;
}

export default function ContactPage() {
	const { user } = useAuth();
	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState({});
	const [status, setStatus] = useState('idle'); // idle | sending | sent | error
	const [serverError, setServerError] = useState('');

	useEffect(() => {
		document.title = 'Contact us';
	}, []);

	// Logged-in visitors get their name and email filled in (only if they haven't typed anything).
	useEffect(() => {
		if (!user) return;
		setValues((v) => ({ ...v, name: v.name || user.name || '', email: v.email || user.email || '' }));
	}, [user]);

	const set = (field) => (e) => {
		const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
		setValues((v) => ({ ...v, [field]: value }));
		if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
	};

	const submit = async (e) => {
		e.preventDefault();
		if (status === 'sending') return;

		const found = validate(values);
		setErrors(found);
		if (Object.keys(found).length > 0) {
			document.querySelector('[aria-invalid="true"]')?.focus();
			return;
		}

		// Bots tick the hidden checkbox. Pretend it worked and send nothing.
		if (values.botcheck) {
			setStatus('sent');
			return;
		}

		if (!ACCESS_KEY) {
			setServerError('The contact form isn’t set up yet (missing VITE_WEB3FORMS_ACCESS_KEY).');
			setStatus('error');
			return;
		}

		setStatus('sending');
		setServerError('');
		try {
			const res = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					access_key: ACCESS_KEY,
					subject: `[${values.topic}] New message from ${values.name.trim()}`,
					from_name: 'Professor Directory',
					name: values.name.trim(),
					email: values.email.trim(),
					topic: values.topic,
					message: values.message.trim(),
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.success) throw new Error(data.message || 'Request failed');
			setStatus('sent');
		} catch (err) {
			setServerError(
				err instanceof TypeError
					? 'Couldn’t reach the server. Check your connection and try again.'
					: 'Something went wrong while sending. Please try again.',
			);
			setStatus('error');
		}
	};

	const reset = () => {
		setValues({ ...EMPTY, name: user?.name || '', email: user?.email || '' });
		setErrors({});
		setStatus('idle');
	};

	return (
		<div className="page">
			<Header />

			<main className="subpage">
				<div className="contact-grid">
					<Pencil className="contact-pencil" />

					<section className="contact-intro">
						<p className="eyebrow">Contact us</p>
						<h1>Have questions, feedback, or ideas to improve our platform?</h1>
						<p>We&apos;d love to hear from you!</p>
						<p>
							Whether you need help finding professors or want to share suggestions, feel free to reach out.
							We&apos;re building this platform for students, and your feedback helps us make it better.
						</p>
					</section>

					<section className="panel form-card" aria-labelledby="form-title">
						<h2 id="form-title">Have something to share? Get in touch with us!</h2>

						{status === 'sent' ? (
							<div className="form-done" role="status">
								<span className="form-done-icon"><CheckIcon width={26} height={26} /></span>
								<p className="form-done-title">Thanks for reaching out!</p>
								<p className="muted">Your message has been sent.</p>
								<button type="button" className="btn btn--outline" onClick={reset}>Send another message</button>
							</div>
						) : (
							<form className="form" onSubmit={submit} noValidate>
								<div className="form-row">
									<div className="form-field">
										<label htmlFor="cf-name">Name</label>
										<input
											id="cf-name" type="text" autoComplete="name" maxLength={100}
											value={values.name} onChange={set('name')}
											aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'cf-name-err' : undefined}
										/>
										{errors.name && <p id="cf-name-err" className="field-error">{errors.name}</p>}
									</div>

									<div className="form-field">
										<label htmlFor="cf-email">Email</label>
										<input
											id="cf-email" type="email" autoComplete="email" maxLength={200}
											value={values.email} onChange={set('email')}
											aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'cf-email-err' : undefined}
										/>
										{errors.email && <p id="cf-email-err" className="field-error">{errors.email}</p>}
									</div>
								</div>

								<fieldset className="form-field topics">
									<legend>What is this about?</legend>
									<div className="topic-row">
										{TOPICS.map((t) => (
											<label key={t} className={`topic ${values.topic === t ? 'is-active' : ''}`}>
												<input
													type="radio" name="topic" value={t}
													checked={values.topic === t} onChange={set('topic')}
												/>
												{t}
											</label>
										))}
									</div>
								</fieldset>

								<div className="form-field">
									<label htmlFor="cf-message">Message</label>
									<textarea
										id="cf-message" rows={6} maxLength={2000}
										value={values.message} onChange={set('message')}
										aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? 'cf-message-err' : undefined}
									/>
									<div className="field-meta">
										{errors.message ? <p id="cf-message-err" className="field-error">{errors.message}</p> : <span />}
										<span className="muted">{values.message.length}/2000</span>
									</div>
								</div>

								{/* Honeypot: invisible to people, tempting to bots. */}
								<input
									type="checkbox" name="botcheck" className="sr-only" tabIndex={-1} autoComplete="off"
									checked={values.botcheck} onChange={set('botcheck')} aria-hidden="true"
								/>

								{status === 'error' && <p className="form-error" role="alert">{serverError}</p>}

								<button type="submit" className="btn btn--primary form-submit" disabled={status === 'sending'}>
									{status === 'sending' ? 'Sending…' : 'Send message'}
								</button>
							</form>
						)}
					</section>

					<Eraser className="contact-eraser" />
				</div>
			</main>
		</div>
	);
}
