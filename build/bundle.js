var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_options(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            option.selected = ~value.indexOf(option.__value);
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function isObject(value) {
      const type = typeof value;
      return value != null && (type == 'object' || type == 'function');
    }

    function getColumnSizeClass(isXs, colWidth, colSize) {
      if (colSize === true || colSize === '') {
        return isXs ? 'col' : `col-${colWidth}`;
      } else if (colSize === 'auto') {
        return isXs ? 'col-auto' : `col-${colWidth}-auto`;
      }

      return isXs ? `col-${colSize}` : `col-${colWidth}-${colSize}`;
    }

    function toClassName(value) {
      let result = '';

      if (typeof value === 'string' || typeof value === 'number') {
        result += value;
      } else if (typeof value === 'object') {
        if (Array.isArray(value)) {
          result = value.map(toClassName).filter(Boolean).join(' ');
        } else {
          for (let key in value) {
            if (value[key]) {
              result && (result += ' ');
              result += key;
            }
          }
        }
      }

      return result;
    }

    function classnames(...args) {
      return args.map(toClassName).filter(Boolean).join(' ');
    }

    /* node_modules/sveltestrap/src/Button.svelte generated by Svelte v3.24.1 */

    function create_else_block_1(ctx) {
    	let button;
    	let button_aria_label_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[18].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[17], null);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	let button_levels = [
    		/*$$restProps*/ ctx[10],
    		{ id: /*id*/ ctx[4] },
    		{ class: /*classes*/ ctx[8] },
    		{ disabled: /*disabled*/ ctx[2] },
    		{ value: /*value*/ ctx[6] },
    		{
    			"aria-label": button_aria_label_value = /*ariaLabel*/ ctx[7] || /*defaultAriaLabel*/ ctx[9]
    		},
    		{ style: /*style*/ ctx[5] }
    	];

    	let button_data = {};

    	for (let i = 0; i < button_levels.length; i += 1) {
    		button_data = assign(button_data, button_levels[i]);
    	}

    	return {
    		c() {
    			button = element("button");
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			set_attributes(button, button_data);
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler_1*/ ctx[20]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 131072) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[17], dirty, null, null);
    				}
    			} else {
    				if (default_slot_or_fallback && default_slot_or_fallback.p && dirty & /*close, children, $$scope*/ 131075) {
    					default_slot_or_fallback.p(ctx, dirty);
    				}
    			}

    			set_attributes(button, button_data = get_spread_update(button_levels, [
    				dirty & /*$$restProps*/ 1024 && /*$$restProps*/ ctx[10],
    				(!current || dirty & /*id*/ 16) && { id: /*id*/ ctx[4] },
    				(!current || dirty & /*classes*/ 256) && { class: /*classes*/ ctx[8] },
    				(!current || dirty & /*disabled*/ 4) && { disabled: /*disabled*/ ctx[2] },
    				(!current || dirty & /*value*/ 64) && { value: /*value*/ ctx[6] },
    				(!current || dirty & /*ariaLabel, defaultAriaLabel*/ 640 && button_aria_label_value !== (button_aria_label_value = /*ariaLabel*/ ctx[7] || /*defaultAriaLabel*/ ctx[9])) && { "aria-label": button_aria_label_value },
    				(!current || dirty & /*style*/ 32) && { style: /*style*/ ctx[5] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (34:0) {#if href}
    function create_if_block(ctx) {
    	let a;
    	let current_block_type_index;
    	let if_block;
    	let a_aria_label_value;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*children*/ ctx[0]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	let a_levels = [
    		/*$$restProps*/ ctx[10],
    		{ id: /*id*/ ctx[4] },
    		{ class: /*classes*/ ctx[8] },
    		{ disabled: /*disabled*/ ctx[2] },
    		{ href: /*href*/ ctx[3] },
    		{
    			"aria-label": a_aria_label_value = /*ariaLabel*/ ctx[7] || /*defaultAriaLabel*/ ctx[9]
    		},
    		{ style: /*style*/ ctx[5] }
    	];

    	let a_data = {};

    	for (let i = 0; i < a_levels.length; i += 1) {
    		a_data = assign(a_data, a_levels[i]);
    	}

    	return {
    		c() {
    			a = element("a");
    			if_block.c();
    			set_attributes(a, a_data);
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);
    			if_blocks[current_block_type_index].m(a, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen(a, "click", /*click_handler*/ ctx[19]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(a, null);
    			}

    			set_attributes(a, a_data = get_spread_update(a_levels, [
    				dirty & /*$$restProps*/ 1024 && /*$$restProps*/ ctx[10],
    				(!current || dirty & /*id*/ 16) && { id: /*id*/ ctx[4] },
    				(!current || dirty & /*classes*/ 256) && { class: /*classes*/ ctx[8] },
    				(!current || dirty & /*disabled*/ 4) && { disabled: /*disabled*/ ctx[2] },
    				(!current || dirty & /*href*/ 8) && { href: /*href*/ ctx[3] },
    				(!current || dirty & /*ariaLabel, defaultAriaLabel*/ 640 && a_aria_label_value !== (a_aria_label_value = /*ariaLabel*/ ctx[7] || /*defaultAriaLabel*/ ctx[9])) && { "aria-label": a_aria_label_value },
    				(!current || dirty & /*style*/ 32) && { style: /*style*/ ctx[5] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    			if_blocks[current_block_type_index].d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (65:6) {:else}
    function create_else_block_2(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[18].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[17], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 131072) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[17], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (63:25) 
    function create_if_block_3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*children*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*children*/ 1) set_data(t, /*children*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (61:6) {#if close}
    function create_if_block_2(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "×";
    			attr(span, "aria-hidden", "true");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (60:10)        
    function fallback_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_2, create_if_block_3, create_else_block_2];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*close*/ ctx[1]) return 0;
    		if (/*children*/ ctx[0]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_2(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (46:4) {:else}
    function create_else_block(ctx) {
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[18].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[17], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 131072) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[17], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (44:4) {#if children}
    function create_if_block_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*children*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*children*/ 1) set_data(t, /*children*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*href*/ ctx[3]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","active","block","children","close","color","disabled","href","id","outline","size","style","value"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { active = false } = $$props;
    	let { block = false } = $$props;
    	let { children = undefined } = $$props;
    	let { close = false } = $$props;
    	let { color = "secondary" } = $$props;
    	let { disabled = false } = $$props;
    	let { href = "" } = $$props;
    	let { id = "" } = $$props;
    	let { outline = false } = $$props;
    	let { size = null } = $$props;
    	let { style = "" } = $$props;
    	let { value = "" } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function click_handler_1(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(21, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(10, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(11, className = $$new_props.class);
    		if ("active" in $$new_props) $$invalidate(12, active = $$new_props.active);
    		if ("block" in $$new_props) $$invalidate(13, block = $$new_props.block);
    		if ("children" in $$new_props) $$invalidate(0, children = $$new_props.children);
    		if ("close" in $$new_props) $$invalidate(1, close = $$new_props.close);
    		if ("color" in $$new_props) $$invalidate(14, color = $$new_props.color);
    		if ("disabled" in $$new_props) $$invalidate(2, disabled = $$new_props.disabled);
    		if ("href" in $$new_props) $$invalidate(3, href = $$new_props.href);
    		if ("id" in $$new_props) $$invalidate(4, id = $$new_props.id);
    		if ("outline" in $$new_props) $$invalidate(15, outline = $$new_props.outline);
    		if ("size" in $$new_props) $$invalidate(16, size = $$new_props.size);
    		if ("style" in $$new_props) $$invalidate(5, style = $$new_props.style);
    		if ("value" in $$new_props) $$invalidate(6, value = $$new_props.value);
    		if ("$$scope" in $$new_props) $$invalidate(17, $$scope = $$new_props.$$scope);
    	};

    	let ariaLabel;
    	let classes;
    	let defaultAriaLabel;

    	$$self.$$.update = () => {
    		 $$invalidate(7, ariaLabel = $$props["aria-label"]);

    		if ($$self.$$.dirty & /*className, close, outline, color, size, block, active*/ 129026) {
    			 $$invalidate(8, classes = classnames(className, { close }, close || "btn", close || `btn${outline ? "-outline" : ""}-${color}`, size ? `btn-${size}` : false, block ? "btn-block" : false, { active }));
    		}

    		if ($$self.$$.dirty & /*close*/ 2) {
    			 $$invalidate(9, defaultAriaLabel = close ? "Close" : null);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		children,
    		close,
    		disabled,
    		href,
    		id,
    		style,
    		value,
    		ariaLabel,
    		classes,
    		defaultAriaLabel,
    		$$restProps,
    		className,
    		active,
    		block,
    		color,
    		outline,
    		size,
    		$$scope,
    		$$slots,
    		click_handler,
    		click_handler_1
    	];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			class: 11,
    			active: 12,
    			block: 13,
    			children: 0,
    			close: 1,
    			color: 14,
    			disabled: 2,
    			href: 3,
    			id: 4,
    			outline: 15,
    			size: 16,
    			style: 5,
    			value: 6
    		});
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    /* node_modules/sveltestrap/src/Col.svelte generated by Svelte v3.24.1 */

    function create_fragment$1(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	let div_levels = [
    		/*$$restProps*/ ctx[2],
    		{ id: /*id*/ ctx[0] },
    		{
    			class: div_class_value = /*colClasses*/ ctx[1].join(" ")
    		}
    	];

    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], dirty, null, null);
    				}
    			}

    			set_attributes(div, div_data = get_spread_update(div_levels, [
    				dirty & /*$$restProps*/ 4 && /*$$restProps*/ ctx[2],
    				(!current || dirty & /*id*/ 1) && { id: /*id*/ ctx[0] },
    				{ class: div_class_value }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","id"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { id = "" } = $$props;
    	const colClasses = [];
    	const widths = ["xs", "sm", "md", "lg", "xl"];

    	widths.forEach(colWidth => {
    		const columnProp = $$props[colWidth];

    		if (!columnProp && columnProp !== "") {
    			return; //no value for this width
    		}

    		const isXs = colWidth === "xs";

    		if (isObject(columnProp)) {
    			const colSizeInterfix = isXs ? "-" : `-${colWidth}-`;
    			const colClass = getColumnSizeClass(isXs, colWidth, columnProp.size);

    			if (columnProp.size || columnProp.size === "") {
    				colClasses.push(colClass);
    			}

    			if (columnProp.push) {
    				colClasses.push(`push${colSizeInterfix}${columnProp.push}`);
    			}

    			if (columnProp.pull) {
    				colClasses.push(`pull${colSizeInterfix}${columnProp.pull}`);
    			}

    			if (columnProp.offset) {
    				colClasses.push(`offset${colSizeInterfix}${columnProp.offset}`);
    			}
    		} else {
    			colClasses.push(getColumnSizeClass(isXs, colWidth, columnProp));
    		}
    	});

    	if (!colClasses.length) {
    		colClasses.push("col");
    	}

    	if (className) {
    		colClasses.push(className);
    	}

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$$set = $$new_props => {
    		$$invalidate(7, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	$$props = exclude_internal_props($$props);
    	return [id, colClasses, $$restProps, className, $$scope, $$slots];
    }

    class Col extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { class: 3, id: 0 });
    	}
    }

    /* node_modules/sveltestrap/src/Container.svelte generated by Svelte v3.24.1 */

    function create_fragment$2(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);
    	let div_levels = [/*$$restProps*/ ctx[2], { id: /*id*/ ctx[0] }, { class: /*classes*/ ctx[1] }];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], dirty, null, null);
    				}
    			}

    			set_attributes(div, div_data = get_spread_update(div_levels, [
    				dirty & /*$$restProps*/ 4 && /*$$restProps*/ ctx[2],
    				(!current || dirty & /*id*/ 1) && { id: /*id*/ ctx[0] },
    				(!current || dirty & /*classes*/ 2) && { class: /*classes*/ ctx[1] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","fluid","id"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { fluid = false } = $$props;
    	let { id = "" } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("fluid" in $$new_props) $$invalidate(4, fluid = $$new_props.fluid);
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("$$scope" in $$new_props) $$invalidate(5, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*className, fluid*/ 24) {
    			 $$invalidate(1, classes = classnames(className, fluid ? "container-fluid" : "container"));
    		}
    	};

    	return [id, classes, $$restProps, className, fluid, $$scope, $$slots];
    }

    class Container extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { class: 3, fluid: 4, id: 0 });
    	}
    }

    /* node_modules/sveltestrap/src/Form.svelte generated by Svelte v3.24.1 */

    function create_fragment$3(ctx) {
    	let form;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
    	let form_levels = [/*$$restProps*/ ctx[1], { class: /*classes*/ ctx[0] }];
    	let form_data = {};

    	for (let i = 0; i < form_levels.length; i += 1) {
    		form_data = assign(form_data, form_levels[i]);
    	}

    	return {
    		c() {
    			form = element("form");
    			if (default_slot) default_slot.c();
    			set_attributes(form, form_data);
    		},
    		m(target, anchor) {
    			insert(target, form, anchor);

    			if (default_slot) {
    				default_slot.m(form, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(form, "submit", /*submit_handler*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], dirty, null, null);
    				}
    			}

    			set_attributes(form, form_data = get_spread_update(form_levels, [
    				dirty & /*$$restProps*/ 2 && /*$$restProps*/ ctx[1],
    				(!current || dirty & /*classes*/ 1) && { class: /*classes*/ ctx[0] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(form);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","inline"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { inline = false } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function submit_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(1, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(2, className = $$new_props.class);
    		if ("inline" in $$new_props) $$invalidate(3, inline = $$new_props.inline);
    		if ("$$scope" in $$new_props) $$invalidate(4, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*className, inline*/ 12) {
    			 $$invalidate(0, classes = classnames(className, inline ? "form-inline" : false));
    		}
    	};

    	return [classes, $$restProps, className, inline, $$scope, $$slots, submit_handler];
    }

    class Form extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { class: 2, inline: 3 });
    	}
    }

    /* node_modules/sveltestrap/src/FormGroup.svelte generated by Svelte v3.24.1 */

    function create_else_block$1(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);
    	let div_levels = [/*$$restProps*/ ctx[3], { id: /*id*/ ctx[0] }, { class: /*classes*/ ctx[2] }];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 512) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, null, null);
    				}
    			}

    			set_attributes(div, div_data = get_spread_update(div_levels, [
    				dirty & /*$$restProps*/ 8 && /*$$restProps*/ ctx[3],
    				(!current || dirty & /*id*/ 1) && { id: /*id*/ ctx[0] },
    				(!current || dirty & /*classes*/ 4) && { class: /*classes*/ ctx[2] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (22:0) {#if tag === 'fieldset'}
    function create_if_block$1(ctx) {
    	let fieldset;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);
    	let fieldset_levels = [/*$$restProps*/ ctx[3], { id: /*id*/ ctx[0] }, { class: /*classes*/ ctx[2] }];
    	let fieldset_data = {};

    	for (let i = 0; i < fieldset_levels.length; i += 1) {
    		fieldset_data = assign(fieldset_data, fieldset_levels[i]);
    	}

    	return {
    		c() {
    			fieldset = element("fieldset");
    			if (default_slot) default_slot.c();
    			set_attributes(fieldset, fieldset_data);
    		},
    		m(target, anchor) {
    			insert(target, fieldset, anchor);

    			if (default_slot) {
    				default_slot.m(fieldset, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 512) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, null, null);
    				}
    			}

    			set_attributes(fieldset, fieldset_data = get_spread_update(fieldset_levels, [
    				dirty & /*$$restProps*/ 8 && /*$$restProps*/ ctx[3],
    				(!current || dirty & /*id*/ 1) && { id: /*id*/ ctx[0] },
    				(!current || dirty & /*classes*/ 4) && { class: /*classes*/ ctx[2] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(fieldset);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*tag*/ ctx[1] === "fieldset") return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","row","check","inline","disabled","id","tag"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { row = false } = $$props;
    	let { check = false } = $$props;
    	let { inline = false } = $$props;
    	let { disabled = false } = $$props;
    	let { id = "" } = $$props;
    	let { tag = null } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(4, className = $$new_props.class);
    		if ("row" in $$new_props) $$invalidate(5, row = $$new_props.row);
    		if ("check" in $$new_props) $$invalidate(6, check = $$new_props.check);
    		if ("inline" in $$new_props) $$invalidate(7, inline = $$new_props.inline);
    		if ("disabled" in $$new_props) $$invalidate(8, disabled = $$new_props.disabled);
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("tag" in $$new_props) $$invalidate(1, tag = $$new_props.tag);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*className, row, check, inline, disabled*/ 496) {
    			 $$invalidate(2, classes = classnames(className, row ? "row" : false, check ? "form-check" : "form-group", check && inline ? "form-check-inline" : false, check && disabled ? "disabled" : false));
    		}
    	};

    	return [
    		id,
    		tag,
    		classes,
    		$$restProps,
    		className,
    		row,
    		check,
    		inline,
    		disabled,
    		$$scope,
    		$$slots
    	];
    }

    class FormGroup extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			class: 4,
    			row: 5,
    			check: 6,
    			inline: 7,
    			disabled: 8,
    			id: 0,
    			tag: 1
    		});
    	}
    }

    /* node_modules/sveltestrap/src/Input.svelte generated by Svelte v3.24.1 */

    function create_if_block_16(ctx) {
    	let select;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[23].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[22], null);

    	let select_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] }
    	];

    	let select_data = {};

    	for (let i = 0; i < select_levels.length; i += 1) {
    		select_data = assign(select_data, select_levels[i]);
    	}

    	return {
    		c() {
    			select = element("select");
    			if (default_slot) default_slot.c();
    			set_attributes(select, select_data);
    			if (/*value*/ ctx[1] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[153].call(select));
    		},
    		m(target, anchor) {
    			insert(target, select, anchor);

    			if (default_slot) {
    				default_slot.m(select, null);
    			}

    			if (select_data.multiple) select_options(select, select_data.value);
    			select_option(select, /*value*/ ctx[1]);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(select, "blur", /*blur_handler_16*/ ctx[134]),
    					listen(select, "focus", /*focus_handler_16*/ ctx[135]),
    					listen(select, "change", /*change_handler_15*/ ctx[136]),
    					listen(select, "input", /*input_handler_15*/ ctx[137]),
    					listen(select, "change", /*select_change_handler*/ ctx[153])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty[0] & /*$$scope*/ 4194304) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[22], dirty, null, null);
    				}
    			}

    			set_attributes(select, select_data = get_spread_update(select_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				(!current || dirty[0] & /*id*/ 64) && { id: /*id*/ ctx[6] },
    				(!current || dirty[0] & /*classes*/ 1024) && { class: /*classes*/ ctx[10] },
    				(!current || dirty[0] & /*name*/ 128) && { name: /*name*/ ctx[7] },
    				(!current || dirty[0] & /*disabled*/ 512) && { disabled: /*disabled*/ ctx[9] }
    			]));

    			if (dirty[0] & /*$$restProps, id, classes, name, disabled*/ 9920 && select_data.multiple) select_options(select, select_data.value);

    			if (dirty[0] & /*value*/ 2) {
    				select_option(select, /*value*/ ctx[1]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(select);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (356:29) 
    function create_if_block_15(ctx) {
    	let textarea;
    	let mounted;
    	let dispose;

    	let textarea_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] }
    	];

    	let textarea_data = {};

    	for (let i = 0; i < textarea_levels.length; i += 1) {
    		textarea_data = assign(textarea_data, textarea_levels[i]);
    	}

    	return {
    		c() {
    			textarea = element("textarea");
    			set_attributes(textarea, textarea_data);
    		},
    		m(target, anchor) {
    			insert(target, textarea, anchor);
    			set_input_value(textarea, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(textarea, "blur", /*blur_handler_15*/ ctx[127]),
    					listen(textarea, "focus", /*focus_handler_15*/ ctx[128]),
    					listen(textarea, "keydown", /*keydown_handler_15*/ ctx[129]),
    					listen(textarea, "keypress", /*keypress_handler_15*/ ctx[130]),
    					listen(textarea, "keyup", /*keyup_handler_15*/ ctx[131]),
    					listen(textarea, "change", /*change_handler_14*/ ctx[132]),
    					listen(textarea, "input", /*input_handler_14*/ ctx[133]),
    					listen(textarea, "input", /*textarea_input_handler*/ ctx[152])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(textarea, textarea_data = get_spread_update(textarea_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(textarea, /*value*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (83:0) {#if tag === 'input'}
    function create_if_block$2(ctx) {
    	let if_block_anchor;

    	function select_block_type_1(ctx, dirty) {
    		if (/*type*/ ctx[3] === "text") return create_if_block_1$1;
    		if (/*type*/ ctx[3] === "password") return create_if_block_2$1;
    		if (/*type*/ ctx[3] === "email") return create_if_block_3$1;
    		if (/*type*/ ctx[3] === "file") return create_if_block_4;
    		if (/*type*/ ctx[3] === "checkbox") return create_if_block_5;
    		if (/*type*/ ctx[3] === "radio") return create_if_block_6;
    		if (/*type*/ ctx[3] === "url") return create_if_block_7;
    		if (/*type*/ ctx[3] === "number") return create_if_block_8;
    		if (/*type*/ ctx[3] === "date") return create_if_block_9;
    		if (/*type*/ ctx[3] === "time") return create_if_block_10;
    		if (/*type*/ ctx[3] === "datetime") return create_if_block_11;
    		if (/*type*/ ctx[3] === "color") return create_if_block_12;
    		if (/*type*/ ctx[3] === "range") return create_if_block_13;
    		if (/*type*/ ctx[3] === "search") return create_if_block_14;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (337:2) {:else}
    function create_else_block$2(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: /*type*/ ctx[3] },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] },
    		{ value: /*value*/ ctx[1] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_14*/ ctx[122]),
    					listen(input, "focus", /*focus_handler_14*/ ctx[123]),
    					listen(input, "keydown", /*keydown_handler_14*/ ctx[124]),
    					listen(input, "keypress", /*keypress_handler_14*/ ctx[125]),
    					listen(input, "keyup", /*keyup_handler_14*/ ctx[126]),
    					listen(input, "input", /*handleInput*/ ctx[12]),
    					listen(input, "change", /*handleInput*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				dirty[0] & /*type*/ 8 && { type: /*type*/ ctx[3] },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] },
    				dirty[0] & /*value*/ 2 && input.value !== /*value*/ ctx[1] && { value: /*value*/ ctx[1] }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (319:30) 
    function create_if_block_14(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "search" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_13*/ ctx[115]),
    					listen(input, "focus", /*focus_handler_13*/ ctx[116]),
    					listen(input, "keydown", /*keydown_handler_13*/ ctx[117]),
    					listen(input, "keypress", /*keypress_handler_13*/ ctx[118]),
    					listen(input, "keyup", /*keyup_handler_13*/ ctx[119]),
    					listen(input, "change", /*change_handler_13*/ ctx[120]),
    					listen(input, "input", /*input_handler_13*/ ctx[121]),
    					listen(input, "input", /*input_input_handler_9*/ ctx[151])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "search" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (301:29) 
    function create_if_block_13(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "range" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_12*/ ctx[108]),
    					listen(input, "focus", /*focus_handler_12*/ ctx[109]),
    					listen(input, "keydown", /*keydown_handler_12*/ ctx[110]),
    					listen(input, "keypress", /*keypress_handler_12*/ ctx[111]),
    					listen(input, "keyup", /*keyup_handler_12*/ ctx[112]),
    					listen(input, "change", /*change_handler_12*/ ctx[113]),
    					listen(input, "input", /*input_handler_12*/ ctx[114]),
    					listen(input, "change", /*input_change_input_handler*/ ctx[150]),
    					listen(input, "input", /*input_change_input_handler*/ ctx[150])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "range" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (283:29) 
    function create_if_block_12(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "color" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_11*/ ctx[101]),
    					listen(input, "focus", /*focus_handler_11*/ ctx[102]),
    					listen(input, "keydown", /*keydown_handler_11*/ ctx[103]),
    					listen(input, "keypress", /*keypress_handler_11*/ ctx[104]),
    					listen(input, "keyup", /*keyup_handler_11*/ ctx[105]),
    					listen(input, "change", /*change_handler_11*/ ctx[106]),
    					listen(input, "input", /*input_handler_11*/ ctx[107]),
    					listen(input, "input", /*input_input_handler_8*/ ctx[149])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "color" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (265:32) 
    function create_if_block_11(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "datetime" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_10*/ ctx[94]),
    					listen(input, "focus", /*focus_handler_10*/ ctx[95]),
    					listen(input, "keydown", /*keydown_handler_10*/ ctx[96]),
    					listen(input, "keypress", /*keypress_handler_10*/ ctx[97]),
    					listen(input, "keyup", /*keyup_handler_10*/ ctx[98]),
    					listen(input, "change", /*change_handler_10*/ ctx[99]),
    					listen(input, "input", /*input_handler_10*/ ctx[100]),
    					listen(input, "input", /*input_input_handler_7*/ ctx[148])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "datetime" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (247:28) 
    function create_if_block_10(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "time" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_9*/ ctx[87]),
    					listen(input, "focus", /*focus_handler_9*/ ctx[88]),
    					listen(input, "keydown", /*keydown_handler_9*/ ctx[89]),
    					listen(input, "keypress", /*keypress_handler_9*/ ctx[90]),
    					listen(input, "keyup", /*keyup_handler_9*/ ctx[91]),
    					listen(input, "change", /*change_handler_9*/ ctx[92]),
    					listen(input, "input", /*input_handler_9*/ ctx[93]),
    					listen(input, "input", /*input_input_handler_6*/ ctx[147])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "time" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (229:28) 
    function create_if_block_9(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "date" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_8*/ ctx[80]),
    					listen(input, "focus", /*focus_handler_8*/ ctx[81]),
    					listen(input, "keydown", /*keydown_handler_8*/ ctx[82]),
    					listen(input, "keypress", /*keypress_handler_8*/ ctx[83]),
    					listen(input, "keyup", /*keyup_handler_8*/ ctx[84]),
    					listen(input, "change", /*change_handler_8*/ ctx[85]),
    					listen(input, "input", /*input_handler_8*/ ctx[86]),
    					listen(input, "input", /*input_input_handler_5*/ ctx[146])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "date" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (211:30) 
    function create_if_block_8(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "number" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_7*/ ctx[73]),
    					listen(input, "focus", /*focus_handler_7*/ ctx[74]),
    					listen(input, "keydown", /*keydown_handler_7*/ ctx[75]),
    					listen(input, "keypress", /*keypress_handler_7*/ ctx[76]),
    					listen(input, "keyup", /*keyup_handler_7*/ ctx[77]),
    					listen(input, "change", /*change_handler_7*/ ctx[78]),
    					listen(input, "input", /*input_handler_7*/ ctx[79]),
    					listen(input, "input", /*input_input_handler_4*/ ctx[145])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "number" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2 && to_number(input.value) !== /*value*/ ctx[1]) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (193:27) 
    function create_if_block_7(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "url" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_6*/ ctx[66]),
    					listen(input, "focus", /*focus_handler_6*/ ctx[67]),
    					listen(input, "keydown", /*keydown_handler_6*/ ctx[68]),
    					listen(input, "keypress", /*keypress_handler_6*/ ctx[69]),
    					listen(input, "keyup", /*keyup_handler_6*/ ctx[70]),
    					listen(input, "change", /*change_handler_6*/ ctx[71]),
    					listen(input, "input", /*input_handler_6*/ ctx[72]),
    					listen(input, "input", /*input_input_handler_3*/ ctx[144])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "url" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (175:29) 
    function create_if_block_6(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "radio" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_5*/ ctx[59]),
    					listen(input, "focus", /*focus_handler_5*/ ctx[60]),
    					listen(input, "keydown", /*keydown_handler_5*/ ctx[61]),
    					listen(input, "keypress", /*keypress_handler_5*/ ctx[62]),
    					listen(input, "keyup", /*keyup_handler_5*/ ctx[63]),
    					listen(input, "change", /*change_handler_5*/ ctx[64]),
    					listen(input, "input", /*input_handler_5*/ ctx[65]),
    					listen(input, "change", /*input_change_handler_2*/ ctx[143])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "radio" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (156:32) 
    function create_if_block_5(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "checkbox" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			input.checked = /*checked*/ ctx[0];
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_4*/ ctx[52]),
    					listen(input, "focus", /*focus_handler_4*/ ctx[53]),
    					listen(input, "keydown", /*keydown_handler_4*/ ctx[54]),
    					listen(input, "keypress", /*keypress_handler_4*/ ctx[55]),
    					listen(input, "keyup", /*keyup_handler_4*/ ctx[56]),
    					listen(input, "change", /*change_handler_4*/ ctx[57]),
    					listen(input, "input", /*input_handler_4*/ ctx[58]),
    					listen(input, "change", /*input_change_handler_1*/ ctx[142])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "checkbox" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*checked*/ 1) {
    				input.checked = /*checked*/ ctx[0];
    			}

    			if (dirty[0] & /*value*/ 2) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (138:28) 
    function create_if_block_4(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "file" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_3*/ ctx[45]),
    					listen(input, "focus", /*focus_handler_3*/ ctx[46]),
    					listen(input, "keydown", /*keydown_handler_3*/ ctx[47]),
    					listen(input, "keypress", /*keypress_handler_3*/ ctx[48]),
    					listen(input, "keyup", /*keyup_handler_3*/ ctx[49]),
    					listen(input, "change", /*change_handler_3*/ ctx[50]),
    					listen(input, "input", /*input_handler_3*/ ctx[51]),
    					listen(input, "change", /*input_change_handler*/ ctx[141])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "file" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (120:29) 
    function create_if_block_3$1(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "email" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_2*/ ctx[38]),
    					listen(input, "focus", /*focus_handler_2*/ ctx[39]),
    					listen(input, "keydown", /*keydown_handler_2*/ ctx[40]),
    					listen(input, "keypress", /*keypress_handler_2*/ ctx[41]),
    					listen(input, "keyup", /*keyup_handler_2*/ ctx[42]),
    					listen(input, "change", /*change_handler_2*/ ctx[43]),
    					listen(input, "input", /*input_handler_2*/ ctx[44]),
    					listen(input, "input", /*input_input_handler_2*/ ctx[140])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "email" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2 && input.value !== /*value*/ ctx[1]) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (102:32) 
    function create_if_block_2$1(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "password" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_1*/ ctx[31]),
    					listen(input, "focus", /*focus_handler_1*/ ctx[32]),
    					listen(input, "keydown", /*keydown_handler_1*/ ctx[33]),
    					listen(input, "keypress", /*keypress_handler_1*/ ctx[34]),
    					listen(input, "keyup", /*keyup_handler_1*/ ctx[35]),
    					listen(input, "change", /*change_handler_1*/ ctx[36]),
    					listen(input, "input", /*input_handler_1*/ ctx[37]),
    					listen(input, "input", /*input_input_handler_1*/ ctx[139])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "password" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2 && input.value !== /*value*/ ctx[1]) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (84:2) {#if type === 'text'}
    function create_if_block_1$1(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		/*$$restProps*/ ctx[13],
    		{ id: /*id*/ ctx[6] },
    		{ type: "text" },
    		{ readOnly: /*readonly*/ ctx[4] },
    		{ class: /*classes*/ ctx[10] },
    		{ name: /*name*/ ctx[7] },
    		{ disabled: /*disabled*/ ctx[9] },
    		{ placeholder: /*placeholder*/ ctx[8] }
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			set_input_value(input, /*value*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler*/ ctx[24]),
    					listen(input, "focus", /*focus_handler*/ ctx[25]),
    					listen(input, "keydown", /*keydown_handler*/ ctx[26]),
    					listen(input, "keypress", /*keypress_handler*/ ctx[27]),
    					listen(input, "keyup", /*keyup_handler*/ ctx[28]),
    					listen(input, "change", /*change_handler*/ ctx[29]),
    					listen(input, "input", /*input_handler*/ ctx[30]),
    					listen(input, "input", /*input_input_handler*/ ctx[138])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*$$restProps*/ 8192 && /*$$restProps*/ ctx[13],
    				dirty[0] & /*id*/ 64 && { id: /*id*/ ctx[6] },
    				{ type: "text" },
    				dirty[0] & /*readonly*/ 16 && { readOnly: /*readonly*/ ctx[4] },
    				dirty[0] & /*classes*/ 1024 && { class: /*classes*/ ctx[10] },
    				dirty[0] & /*name*/ 128 && { name: /*name*/ ctx[7] },
    				dirty[0] & /*disabled*/ 512 && { disabled: /*disabled*/ ctx[9] },
    				dirty[0] & /*placeholder*/ 256 && { placeholder: /*placeholder*/ ctx[8] }
    			]));

    			if (dirty[0] & /*value*/ 2 && input.value !== /*value*/ ctx[1]) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$2, create_if_block_15, create_if_block_16];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*tag*/ ctx[11] === "input") return 0;
    		if (/*tag*/ ctx[11] === "textarea") return 1;
    		if (/*tag*/ ctx[11] === "select" && !/*multiple*/ ctx[5]) return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"class","type","size","bsSize","color","checked","valid","invalid","plaintext","addon","value","files","readonly","multiple","id","name","placeholder","disabled"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { type = "text" } = $$props;
    	let { size = undefined } = $$props;
    	let { bsSize = undefined } = $$props;
    	let { color = undefined } = $$props;
    	let { checked = false } = $$props;
    	let { valid = false } = $$props;
    	let { invalid = false } = $$props;
    	let { plaintext = false } = $$props;
    	let { addon = false } = $$props;
    	let { value = "" } = $$props;
    	let { files = "" } = $$props;
    	let { readonly } = $$props;
    	let { multiple = false } = $$props;
    	let { id = "" } = $$props;
    	let { name = "" } = $$props;
    	let { placeholder = "" } = $$props;
    	let { disabled = false } = $$props;
    	let classes;
    	let tag;

    	const handleInput = event => {
    		$$invalidate(1, value = event.target.value);
    	};

    	let { $$slots = {}, $$scope } = $$props;

    	function blur_handler(event) {
    		bubble($$self, event);
    	}

    	function focus_handler(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler(event) {
    		bubble($$self, event);
    	}

    	function change_handler(event) {
    		bubble($$self, event);
    	}

    	function input_handler(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_1(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_1(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_1(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_1(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_1(event) {
    		bubble($$self, event);
    	}

    	function change_handler_1(event) {
    		bubble($$self, event);
    	}

    	function input_handler_1(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_2(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_2(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_2(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_2(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_2(event) {
    		bubble($$self, event);
    	}

    	function change_handler_2(event) {
    		bubble($$self, event);
    	}

    	function input_handler_2(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_3(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_3(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_3(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_3(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_3(event) {
    		bubble($$self, event);
    	}

    	function change_handler_3(event) {
    		bubble($$self, event);
    	}

    	function input_handler_3(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_4(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_4(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_4(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_4(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_4(event) {
    		bubble($$self, event);
    	}

    	function change_handler_4(event) {
    		bubble($$self, event);
    	}

    	function input_handler_4(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_5(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_5(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_5(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_5(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_5(event) {
    		bubble($$self, event);
    	}

    	function change_handler_5(event) {
    		bubble($$self, event);
    	}

    	function input_handler_5(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_6(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_6(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_6(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_6(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_6(event) {
    		bubble($$self, event);
    	}

    	function change_handler_6(event) {
    		bubble($$self, event);
    	}

    	function input_handler_6(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_7(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_7(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_7(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_7(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_7(event) {
    		bubble($$self, event);
    	}

    	function change_handler_7(event) {
    		bubble($$self, event);
    	}

    	function input_handler_7(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_8(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_8(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_8(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_8(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_8(event) {
    		bubble($$self, event);
    	}

    	function change_handler_8(event) {
    		bubble($$self, event);
    	}

    	function input_handler_8(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_9(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_9(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_9(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_9(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_9(event) {
    		bubble($$self, event);
    	}

    	function change_handler_9(event) {
    		bubble($$self, event);
    	}

    	function input_handler_9(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_10(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_10(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_10(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_10(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_10(event) {
    		bubble($$self, event);
    	}

    	function change_handler_10(event) {
    		bubble($$self, event);
    	}

    	function input_handler_10(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_11(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_11(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_11(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_11(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_11(event) {
    		bubble($$self, event);
    	}

    	function change_handler_11(event) {
    		bubble($$self, event);
    	}

    	function input_handler_11(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_12(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_12(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_12(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_12(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_12(event) {
    		bubble($$self, event);
    	}

    	function change_handler_12(event) {
    		bubble($$self, event);
    	}

    	function input_handler_12(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_13(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_13(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_13(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_13(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_13(event) {
    		bubble($$self, event);
    	}

    	function change_handler_13(event) {
    		bubble($$self, event);
    	}

    	function input_handler_13(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_14(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_14(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_14(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_14(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_14(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_15(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_15(event) {
    		bubble($$self, event);
    	}

    	function keydown_handler_15(event) {
    		bubble($$self, event);
    	}

    	function keypress_handler_15(event) {
    		bubble($$self, event);
    	}

    	function keyup_handler_15(event) {
    		bubble($$self, event);
    	}

    	function change_handler_14(event) {
    		bubble($$self, event);
    	}

    	function input_handler_14(event) {
    		bubble($$self, event);
    	}

    	function blur_handler_16(event) {
    		bubble($$self, event);
    	}

    	function focus_handler_16(event) {
    		bubble($$self, event);
    	}

    	function change_handler_15(event) {
    		bubble($$self, event);
    	}

    	function input_handler_15(event) {
    		bubble($$self, event);
    	}

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_1() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_2() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_change_handler() {
    		files = this.files;
    		$$invalidate(2, files);
    	}

    	function input_change_handler_1() {
    		checked = this.checked;
    		value = this.value;
    		$$invalidate(0, checked);
    		$$invalidate(1, value);
    	}

    	function input_change_handler_2() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_3() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_4() {
    		value = to_number(this.value);
    		$$invalidate(1, value);
    	}

    	function input_input_handler_5() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_6() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_7() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_input_handler_8() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function input_change_input_handler() {
    		value = to_number(this.value);
    		$$invalidate(1, value);
    	}

    	function input_input_handler_9() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function textarea_input_handler() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	function select_change_handler() {
    		value = select_value(this);
    		$$invalidate(1, value);
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(13, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(16, className = $$new_props.class);
    		if ("type" in $$new_props) $$invalidate(3, type = $$new_props.type);
    		if ("size" in $$new_props) $$invalidate(14, size = $$new_props.size);
    		if ("bsSize" in $$new_props) $$invalidate(15, bsSize = $$new_props.bsSize);
    		if ("color" in $$new_props) $$invalidate(17, color = $$new_props.color);
    		if ("checked" in $$new_props) $$invalidate(0, checked = $$new_props.checked);
    		if ("valid" in $$new_props) $$invalidate(18, valid = $$new_props.valid);
    		if ("invalid" in $$new_props) $$invalidate(19, invalid = $$new_props.invalid);
    		if ("plaintext" in $$new_props) $$invalidate(20, plaintext = $$new_props.plaintext);
    		if ("addon" in $$new_props) $$invalidate(21, addon = $$new_props.addon);
    		if ("value" in $$new_props) $$invalidate(1, value = $$new_props.value);
    		if ("files" in $$new_props) $$invalidate(2, files = $$new_props.files);
    		if ("readonly" in $$new_props) $$invalidate(4, readonly = $$new_props.readonly);
    		if ("multiple" in $$new_props) $$invalidate(5, multiple = $$new_props.multiple);
    		if ("id" in $$new_props) $$invalidate(6, id = $$new_props.id);
    		if ("name" in $$new_props) $$invalidate(7, name = $$new_props.name);
    		if ("placeholder" in $$new_props) $$invalidate(8, placeholder = $$new_props.placeholder);
    		if ("disabled" in $$new_props) $$invalidate(9, disabled = $$new_props.disabled);
    		if ("$$scope" in $$new_props) $$invalidate(22, $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*type, plaintext, addon, color, size, className, invalid, valid, bsSize*/ 4177928) {
    			 {
    				const checkInput = ["radio", "checkbox"].indexOf(type) > -1;
    				const isNotaNumber = new RegExp("\\D", "g");
    				const fileInput = type === "file";
    				const textareaInput = type === "textarea";
    				const rangeInput = type === "range";
    				const selectInput = type === "select";
    				const buttonInput = type === "button" || type === "reset" || type === "submit";
    				const unsupportedInput = type === "hidden" || type === "image";
    				$$invalidate(11, tag = selectInput || textareaInput ? type : "input");
    				let formControlClass = "form-control";

    				if (plaintext) {
    					formControlClass = `${formControlClass}-plaintext`;
    					$$invalidate(11, tag = "input");
    				} else if (fileInput) {
    					formControlClass = `${formControlClass}-file`;
    				} else if (checkInput) {
    					if (addon) {
    						formControlClass = null;
    					} else {
    						formControlClass = "form-check-input";
    					}
    				} else if (buttonInput) {
    					formControlClass = `btn btn-${color || "secondary"}`;
    				} else if (rangeInput) {
    					formControlClass = "form-control-range";
    				} else if (unsupportedInput) {
    					formControlClass = "";
    				}

    				if (size && isNotaNumber.test(size)) {
    					console.warn("Please use the prop \"bsSize\" instead of the \"size\" to bootstrap's input sizing.");
    					$$invalidate(15, bsSize = size);
    					$$invalidate(14, size = undefined);
    				}

    				$$invalidate(10, classes = classnames(className, invalid && "is-invalid", valid && "is-valid", bsSize ? `form-control-${bsSize}` : false, formControlClass));
    			}
    		}
    	};

    	return [
    		checked,
    		value,
    		files,
    		type,
    		readonly,
    		multiple,
    		id,
    		name,
    		placeholder,
    		disabled,
    		classes,
    		tag,
    		handleInput,
    		$$restProps,
    		size,
    		bsSize,
    		className,
    		color,
    		valid,
    		invalid,
    		plaintext,
    		addon,
    		$$scope,
    		$$slots,
    		blur_handler,
    		focus_handler,
    		keydown_handler,
    		keypress_handler,
    		keyup_handler,
    		change_handler,
    		input_handler,
    		blur_handler_1,
    		focus_handler_1,
    		keydown_handler_1,
    		keypress_handler_1,
    		keyup_handler_1,
    		change_handler_1,
    		input_handler_1,
    		blur_handler_2,
    		focus_handler_2,
    		keydown_handler_2,
    		keypress_handler_2,
    		keyup_handler_2,
    		change_handler_2,
    		input_handler_2,
    		blur_handler_3,
    		focus_handler_3,
    		keydown_handler_3,
    		keypress_handler_3,
    		keyup_handler_3,
    		change_handler_3,
    		input_handler_3,
    		blur_handler_4,
    		focus_handler_4,
    		keydown_handler_4,
    		keypress_handler_4,
    		keyup_handler_4,
    		change_handler_4,
    		input_handler_4,
    		blur_handler_5,
    		focus_handler_5,
    		keydown_handler_5,
    		keypress_handler_5,
    		keyup_handler_5,
    		change_handler_5,
    		input_handler_5,
    		blur_handler_6,
    		focus_handler_6,
    		keydown_handler_6,
    		keypress_handler_6,
    		keyup_handler_6,
    		change_handler_6,
    		input_handler_6,
    		blur_handler_7,
    		focus_handler_7,
    		keydown_handler_7,
    		keypress_handler_7,
    		keyup_handler_7,
    		change_handler_7,
    		input_handler_7,
    		blur_handler_8,
    		focus_handler_8,
    		keydown_handler_8,
    		keypress_handler_8,
    		keyup_handler_8,
    		change_handler_8,
    		input_handler_8,
    		blur_handler_9,
    		focus_handler_9,
    		keydown_handler_9,
    		keypress_handler_9,
    		keyup_handler_9,
    		change_handler_9,
    		input_handler_9,
    		blur_handler_10,
    		focus_handler_10,
    		keydown_handler_10,
    		keypress_handler_10,
    		keyup_handler_10,
    		change_handler_10,
    		input_handler_10,
    		blur_handler_11,
    		focus_handler_11,
    		keydown_handler_11,
    		keypress_handler_11,
    		keyup_handler_11,
    		change_handler_11,
    		input_handler_11,
    		blur_handler_12,
    		focus_handler_12,
    		keydown_handler_12,
    		keypress_handler_12,
    		keyup_handler_12,
    		change_handler_12,
    		input_handler_12,
    		blur_handler_13,
    		focus_handler_13,
    		keydown_handler_13,
    		keypress_handler_13,
    		keyup_handler_13,
    		change_handler_13,
    		input_handler_13,
    		blur_handler_14,
    		focus_handler_14,
    		keydown_handler_14,
    		keypress_handler_14,
    		keyup_handler_14,
    		blur_handler_15,
    		focus_handler_15,
    		keydown_handler_15,
    		keypress_handler_15,
    		keyup_handler_15,
    		change_handler_14,
    		input_handler_14,
    		blur_handler_16,
    		focus_handler_16,
    		change_handler_15,
    		input_handler_15,
    		input_input_handler,
    		input_input_handler_1,
    		input_input_handler_2,
    		input_change_handler,
    		input_change_handler_1,
    		input_change_handler_2,
    		input_input_handler_3,
    		input_input_handler_4,
    		input_input_handler_5,
    		input_input_handler_6,
    		input_input_handler_7,
    		input_input_handler_8,
    		input_change_input_handler,
    		input_input_handler_9,
    		textarea_input_handler,
    		select_change_handler
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$5,
    			create_fragment$5,
    			safe_not_equal,
    			{
    				class: 16,
    				type: 3,
    				size: 14,
    				bsSize: 15,
    				color: 17,
    				checked: 0,
    				valid: 18,
    				invalid: 19,
    				plaintext: 20,
    				addon: 21,
    				value: 1,
    				files: 2,
    				readonly: 4,
    				multiple: 5,
    				id: 6,
    				name: 7,
    				placeholder: 8,
    				disabled: 9
    			},
    			[-1, -1, -1, -1, -1]
    		);
    	}
    }

    /* node_modules/sveltestrap/src/Label.svelte generated by Svelte v3.24.1 */

    function create_fragment$6(ctx) {
    	let label;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[15].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[14], null);

    	let label_levels = [
    		/*$$restProps*/ ctx[3],
    		{ id: /*id*/ ctx[1] },
    		{ class: /*classes*/ ctx[2] },
    		{ for: /*fore*/ ctx[0] }
    	];

    	let label_data = {};

    	for (let i = 0; i < label_levels.length; i += 1) {
    		label_data = assign(label_data, label_levels[i]);
    	}

    	return {
    		c() {
    			label = element("label");
    			if (default_slot) default_slot.c();
    			set_attributes(label, label_data);
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);

    			if (default_slot) {
    				default_slot.m(label, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 16384) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[14], dirty, null, null);
    				}
    			}

    			set_attributes(label, label_data = get_spread_update(label_levels, [
    				dirty & /*$$restProps*/ 8 && /*$$restProps*/ ctx[3],
    				(!current || dirty & /*id*/ 2) && { id: /*id*/ ctx[1] },
    				(!current || dirty & /*classes*/ 4) && { class: /*classes*/ ctx[2] },
    				(!current || dirty & /*fore*/ 1) && { for: /*fore*/ ctx[0] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","hidden","check","size","for","id","xs","sm","md","lg","xl","widths"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { hidden = false } = $$props;
    	let { check = false } = $$props;
    	let { size = "" } = $$props;
    	let { for: fore = null } = $$props;
    	let { id = "" } = $$props;
    	let { xs = "" } = $$props;
    	let { sm = "" } = $$props;
    	let { md = "" } = $$props;
    	let { lg = "" } = $$props;
    	let { xl = "" } = $$props;
    	const colWidths = { xs, sm, md, lg, xl };
    	let { widths = Object.keys(colWidths) } = $$props;
    	const colClasses = [];

    	widths.forEach(colWidth => {
    		let columnProp = $$props[colWidth];

    		if (!columnProp && columnProp !== "") {
    			return;
    		}

    		const isXs = colWidth === "xs";
    		let colClass;

    		if (isObject(columnProp)) {
    			const colSizeInterfix = isXs ? "-" : `-${colWidth}-`;
    			colClass = getColumnSizeClass(isXs, colWidth, columnProp.size);

    			colClasses.push(classnames({
    				[colClass]: columnProp.size || columnProp.size === "",
    				[`order${colSizeInterfix}${columnProp.order}`]: columnProp.order || columnProp.order === 0,
    				[`offset${colSizeInterfix}${columnProp.offset}`]: columnProp.offset || columnProp.offset === 0
    			}));
    		} else {
    			colClass = getColumnSizeClass(isXs, colWidth, columnProp);
    			colClasses.push(colClass);
    		}
    	});

    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$$set = $$new_props => {
    		$$invalidate(18, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		$$invalidate(3, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(4, className = $$new_props.class);
    		if ("hidden" in $$new_props) $$invalidate(5, hidden = $$new_props.hidden);
    		if ("check" in $$new_props) $$invalidate(6, check = $$new_props.check);
    		if ("size" in $$new_props) $$invalidate(7, size = $$new_props.size);
    		if ("for" in $$new_props) $$invalidate(0, fore = $$new_props.for);
    		if ("id" in $$new_props) $$invalidate(1, id = $$new_props.id);
    		if ("xs" in $$new_props) $$invalidate(8, xs = $$new_props.xs);
    		if ("sm" in $$new_props) $$invalidate(9, sm = $$new_props.sm);
    		if ("md" in $$new_props) $$invalidate(10, md = $$new_props.md);
    		if ("lg" in $$new_props) $$invalidate(11, lg = $$new_props.lg);
    		if ("xl" in $$new_props) $$invalidate(12, xl = $$new_props.xl);
    		if ("widths" in $$new_props) $$invalidate(13, widths = $$new_props.widths);
    		if ("$$scope" in $$new_props) $$invalidate(14, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*className, hidden, check, size*/ 240) {
    			 $$invalidate(2, classes = classnames(className, hidden ? "sr-only" : false, check ? "form-check-label" : false, size ? `col-form-label-${size}` : false, colClasses, colClasses.length ? "col-form-label" : false));
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		fore,
    		id,
    		classes,
    		$$restProps,
    		className,
    		hidden,
    		check,
    		size,
    		xs,
    		sm,
    		md,
    		lg,
    		xl,
    		widths,
    		$$scope,
    		$$slots
    	];
    }

    class Label extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			class: 4,
    			hidden: 5,
    			check: 6,
    			size: 7,
    			for: 0,
    			id: 1,
    			xs: 8,
    			sm: 9,
    			md: 10,
    			lg: 11,
    			xl: 12,
    			widths: 13
    		});
    	}
    }

    /* node_modules/sveltestrap/src/Row.svelte generated by Svelte v3.24.1 */

    function create_fragment$7(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
    	let div_levels = [/*$$restProps*/ ctx[2], { id: /*id*/ ctx[0] }, { class: /*classes*/ ctx[1] }];
    	let div_data = {};

    	for (let i = 0; i < div_levels.length; i += 1) {
    		div_data = assign(div_data, div_levels[i]);
    	}

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			set_attributes(div, div_data);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 64) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[6], dirty, null, null);
    				}
    			}

    			set_attributes(div, div_data = get_spread_update(div_levels, [
    				dirty & /*$$restProps*/ 4 && /*$$restProps*/ ctx[2],
    				(!current || dirty & /*id*/ 1) && { id: /*id*/ ctx[0] },
    				(!current || dirty & /*classes*/ 2) && { class: /*classes*/ ctx[1] }
    			]));
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	const omit_props_names = ["class","noGutters","form","id"];
    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { class: className = "" } = $$props;
    	let { noGutters = false } = $$props;
    	let { form = false } = $$props;
    	let { id = "" } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(2, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ("class" in $$new_props) $$invalidate(3, className = $$new_props.class);
    		if ("noGutters" in $$new_props) $$invalidate(4, noGutters = $$new_props.noGutters);
    		if ("form" in $$new_props) $$invalidate(5, form = $$new_props.form);
    		if ("id" in $$new_props) $$invalidate(0, id = $$new_props.id);
    		if ("$$scope" in $$new_props) $$invalidate(6, $$scope = $$new_props.$$scope);
    	};

    	let classes;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*className, noGutters, form*/ 56) {
    			 $$invalidate(1, classes = classnames(className, noGutters ? "no-gutters" : null, form ? "form-row" : "row"));
    		}
    	};

    	return [id, classes, $$restProps, className, noGutters, form, $$scope, $$slots];
    }

    class Row extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { class: 3, noGutters: 4, form: 5, id: 0 });
    	}
    }

    // Unique ID creation requires a high quality random # generator. In the browser we therefore
    // require the crypto API and do not support built-in fallback to lower quality random number
    // generators (like Math.random()).
    // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation. Also,
    // find the complete implementation of crypto (msCrypto) on IE11.
    var getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto !== 'undefined' && typeof msCrypto.getRandomValues === 'function' && msCrypto.getRandomValues.bind(msCrypto);
    var rnds8 = new Uint8Array(16);
    function rng() {
      if (!getRandomValues) {
        throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
      }

      return getRandomValues(rnds8);
    }

    var REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

    function validate(uuid) {
      return typeof uuid === 'string' && REGEX.test(uuid);
    }

    /**
     * Convert array of 16 byte values to UUID string format of the form:
     * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
     */

    var byteToHex = [];

    for (var i = 0; i < 256; ++i) {
      byteToHex.push((i + 0x100).toString(16).substr(1));
    }

    function stringify(arr) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      // Note: Be careful editing this code!  It's been tuned for performance
      // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
      var uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase(); // Consistency check for valid UUID.  If this throws, it's likely due to one
      // of the following:
      // - One or more input array values don't map to a hex octet (leading to
      // "undefined" in the uuid)
      // - Invalid input values for the RFC `version` or `variant` fields

      if (!validate(uuid)) {
        throw TypeError('Stringified UUID is invalid');
      }

      return uuid;
    }

    function v4(options, buf, offset) {
      options = options || {};
      var rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

      rnds[6] = rnds[6] & 0x0f | 0x40;
      rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

      if (buf) {
        offset = offset || 0;

        for (var i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }

        return buf;
      }

      return stringify(rnds);
    }

    const lessonStore = writable({
        title: "",
        id: v4(),
        version: 1,
        contentType: "png",
        folderName: "",
        author: "",
        authorFolderName: "",
        email: "",
        steps: [],
    });
    var lessonStore$1 = {
        subscribe: lessonStore.subscribe,
        set: lessonStore.set,
    };

    /* src/Form.svelte generated by Svelte v3.24.1 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[15] = list[i];
    	child_ctx[16] = list;
    	child_ctx[17] = i;
    	return child_ctx;
    }

    // (59:4) <Label for="lesson_title">
    function create_default_slot_22(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Title");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (58:2) <FormGroup>
    function create_default_slot_21(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "lesson_title",
    				$$slots: { default: [create_default_slot_22] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding(value) {
    		/*input_value_binding*/ ctx[4].call(null, value);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "lesson_title",
    		placeholder: "title"
    	};

    	if (/*formData*/ ctx[0].title !== void 0) {
    		input_props.value = /*formData*/ ctx[0].title;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].title;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (69:4) <Label for="author">
    function create_default_slot_20(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Author's Name");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (68:2) <FormGroup>
    function create_default_slot_19(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "author",
    				$$slots: { default: [create_default_slot_20] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_1(value) {
    		/*input_value_binding_1*/ ctx[5].call(null, value);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "author"
    	};

    	if (/*formData*/ ctx[0].author !== void 0) {
    		input_props.value = /*formData*/ ctx[0].author;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_1));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].author;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (78:4) <Label for="author_email">
    function create_default_slot_18(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Author's Email");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (77:2) <FormGroup>
    function create_default_slot_17(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "author_email",
    				$$slots: { default: [create_default_slot_18] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_2(value) {
    		/*input_value_binding_2*/ ctx[6].call(null, value);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "author_email"
    	};

    	if (/*formData*/ ctx[0].email !== void 0) {
    		input_props.value = /*formData*/ ctx[0].email;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_2));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].email;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (87:4) <Label for="company_folder">
    function create_default_slot_16(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Author's Folder");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (86:2) <FormGroup>
    function create_default_slot_15(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "company_folder",
    				$$slots: { default: [create_default_slot_16] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_3(value) {
    		/*input_value_binding_3*/ ctx[7].call(null, value);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "company_folder"
    	};

    	if (/*formData*/ ctx[0].authorFolderName !== void 0) {
    		input_props.value = /*formData*/ ctx[0].authorFolderName;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_3));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].authorFolderName;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (96:4) <Label for="folder_name">
    function create_default_slot_14(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Lesson's Folder");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (95:2) <FormGroup>
    function create_default_slot_13(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "folder_name",
    				$$slots: { default: [create_default_slot_14] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_4(value) {
    		/*input_value_binding_4*/ ctx[8].call(null, value);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "folder_name"
    	};

    	if (/*formData*/ ctx[0].folderName !== void 0) {
    		input_props.value = /*formData*/ ctx[0].folderName;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_4));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].folderName;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (106:4) <Label for="contentType">
    function create_default_slot_12(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Preview Image Content Type");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (107:4) <Input       readonly={false}       size="1"       type="select"       bind:value={formData.contentType}       id="contentType">
    function create_default_slot_11(ctx) {
    	let option0;
    	let t1;
    	let option1;
    	let t3;
    	let option2;

    	return {
    		c() {
    			option0 = element("option");
    			option0.textContent = "png";
    			t1 = space();
    			option1 = element("option");
    			option1.textContent = "jpg";
    			t3 = space();
    			option2 = element("option");
    			option2.textContent = "gif";
    			option0.__value = "png";
    			option0.value = option0.__value;
    			option1.__value = "jpg";
    			option1.value = option1.__value;
    			option2.__value = "gif";
    			option2.value = option2.__value;
    		},
    		m(target, anchor) {
    			insert(target, option0, anchor);
    			insert(target, t1, anchor);
    			insert(target, option1, anchor);
    			insert(target, t3, anchor);
    			insert(target, option2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(option0);
    			if (detaching) detach(t1);
    			if (detaching) detach(option1);
    			if (detaching) detach(t3);
    			if (detaching) detach(option2);
    		}
    	};
    }

    // (105:2) <FormGroup>
    function create_default_slot_10(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "contentType",
    				$$slots: { default: [create_default_slot_12] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_5(value) {
    		/*input_value_binding_5*/ ctx[9].call(null, value);
    	}

    	let input_props = {
    		readonly: false,
    		size: "1",
    		type: "select",
    		id: "contentType",
    		$$slots: { default: [create_default_slot_11] },
    		$$scope: { ctx }
    	};

    	if (/*formData*/ ctx[0].contentType !== void 0) {
    		input_props.value = /*formData*/ ctx[0].contentType;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_5));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				input_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].contentType;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (119:4) <Button on:click={addStep} type="button" color="primary">
    function create_default_slot_9(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Add Step");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (132:8) <Label for="step_{index}_title">
    function create_default_slot_8(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Title");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (131:6) <FormGroup>
    function create_default_slot_7(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "step_" + /*index*/ ctx[17] + "_title",
    				$$slots: { default: [create_default_slot_8] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_6(value) {
    		/*input_value_binding_6*/ ctx[11].call(null, value, /*index*/ ctx[17]);
    	}

    	let input_props = {
    		type: "text",
    		size: "1",
    		readonly: false,
    		id: "step_" + /*index*/ ctx[17] + "_title",
    		placeholder: "title"
    	};

    	if (/*formData*/ ctx[0].steps[/*index*/ ctx[17]].title !== void 0) {
    		input_props.value = /*formData*/ ctx[0].steps[/*index*/ ctx[17]].title;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_6));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].steps[/*index*/ ctx[17]].title;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (142:8) <Label for="step_{index}_type">
    function create_default_slot_6(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Content Type");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (143:8) <Input           readonly={false}           size="1"           type="select"           bind:value={formData.steps[index].contentType}           id="step_{index}_type">
    function create_default_slot_5(ctx) {
    	let option0;
    	let t1;
    	let option1;
    	let t3;
    	let option2;
    	let t5;
    	let option3;

    	return {
    		c() {
    			option0 = element("option");
    			option0.textContent = "png";
    			t1 = space();
    			option1 = element("option");
    			option1.textContent = "jpg";
    			t3 = space();
    			option2 = element("option");
    			option2.textContent = "gif";
    			t5 = space();
    			option3 = element("option");
    			option3.textContent = "mp4";
    			option0.__value = "png";
    			option0.value = option0.__value;
    			option1.__value = "jpg";
    			option1.value = option1.__value;
    			option2.__value = "gif";
    			option2.value = option2.__value;
    			option3.__value = "mp4";
    			option3.value = option3.__value;
    		},
    		m(target, anchor) {
    			insert(target, option0, anchor);
    			insert(target, t1, anchor);
    			insert(target, option1, anchor);
    			insert(target, t3, anchor);
    			insert(target, option2, anchor);
    			insert(target, t5, anchor);
    			insert(target, option3, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(option0);
    			if (detaching) detach(t1);
    			if (detaching) detach(option1);
    			if (detaching) detach(t3);
    			if (detaching) detach(option2);
    			if (detaching) detach(t5);
    			if (detaching) detach(option3);
    		}
    	};
    }

    // (141:6) <FormGroup>
    function create_default_slot_4(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;

    	label = new Label({
    			props: {
    				for: "step_" + /*index*/ ctx[17] + "_type",
    				$$slots: { default: [create_default_slot_6] },
    				$$scope: { ctx }
    			}
    		});

    	function input_value_binding_7(value) {
    		/*input_value_binding_7*/ ctx[12].call(null, value, /*index*/ ctx[17]);
    	}

    	let input_props = {
    		readonly: false,
    		size: "1",
    		type: "select",
    		id: "step_" + /*index*/ ctx[17] + "_type",
    		$$slots: { default: [create_default_slot_5] },
    		$$scope: { ctx }
    	};

    	if (/*formData*/ ctx[0].steps[/*index*/ ctx[17]].contentType !== void 0) {
    		input_props.value = /*formData*/ ctx[0].steps[/*index*/ ctx[17]].contentType;
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding_7));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				input_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*formData*/ 1) {
    				updating_value = true;
    				input_changes.value = /*formData*/ ctx[0].steps[/*index*/ ctx[17]].contentType;
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (155:6) {#if formData.steps.length > 1}
    function create_if_block$3(ctx) {
    	let button;
    	let t0;
    	let t1;
    	let if_block1_anchor;
    	let current;

    	button = new Button({
    			props: {
    				type: "button",
    				color: "danger",
    				"data-id": /*formData*/ ctx[0].steps[/*index*/ ctx[17]].id,
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*deleteStep*/ ctx[2]);
    	let if_block0 = /*index*/ ctx[17] > 0 && create_if_block_2$2(ctx);
    	let if_block1 = /*index*/ ctx[17] + 1 < /*formData*/ ctx[0].steps.length && create_if_block_1$2(ctx);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};
    			if (dirty & /*formData*/ 1) button_changes["data-id"] = /*formData*/ ctx[0].steps[/*index*/ ctx[17]].id;

    			if (dirty & /*$$scope*/ 262144) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    			if (/*index*/ ctx[17] > 0) if_block0.p(ctx, dirty);

    			if (/*index*/ ctx[17] + 1 < /*formData*/ ctx[0].steps.length) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*formData*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (156:8) <Button           type="button"           color="danger"           data-id={formData.steps[index].id}           on:click={deleteStep}>
    function create_default_slot_3(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Delete");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (163:8) {#if index > 0}
    function create_if_block_2$2(ctx) {
    	let button;
    	let current;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[13](/*index*/ ctx[17], ...args);
    	}

    	button = new Button({
    			props: {
    				color: "info",
    				type: "button",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", click_handler);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (164:10) <Button             on:click={() => reorderArray(index, index - 1)}             color="info"             type="button">
    function create_default_slot_2(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Up");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (171:8) {#if index + 1 < formData.steps.length}
    function create_if_block_1$2(ctx) {
    	let button;
    	let current;

    	function click_handler_1(...args) {
    		return /*click_handler_1*/ ctx[14](/*index*/ ctx[17], ...args);
    	}

    	button = new Button({
    			props: {
    				color: "info",
    				type: "button",
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", click_handler_1);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (172:10) <Button             on:click={() => reorderArray(index, index + 1)}             color="info"             type="button">
    function create_default_slot_1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Down");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (122:2) {#each formData.steps as step, index}
    function create_each_block(ctx) {
    	let section;
    	let h2;
    	let t0;
    	let t1_value = /*index*/ ctx[17] + 1 + "";
    	let t1;
    	let t2;
    	let input;
    	let input_id_value;
    	let t3;
    	let formgroup0;
    	let t4;
    	let formgroup1;
    	let t5;
    	let t6;
    	let current;
    	let mounted;
    	let dispose;

    	function input_input_handler() {
    		/*input_input_handler*/ ctx[10].call(input, /*index*/ ctx[17]);
    	}

    	formgroup0 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_7] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup1 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			}
    		});

    	let if_block = /*formData*/ ctx[0].steps.length > 1 && create_if_block$3(ctx);

    	return {
    		c() {
    			section = element("section");
    			h2 = element("h2");
    			t0 = text("Step ");
    			t1 = text(t1_value);
    			t2 = space();
    			input = element("input");
    			t3 = space();
    			create_component(formgroup0.$$.fragment);
    			t4 = space();
    			create_component(formgroup1.$$.fragment);
    			t5 = space();
    			if (if_block) if_block.c();
    			t6 = space();
    			attr(input, "type", "hidden");
    			attr(input, "id", input_id_value = "step-" + /*index*/ ctx[17] + "-id");
    			attr(section, "class", "step svelte-19ukitc");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, h2);
    			append(h2, t0);
    			append(h2, t1);
    			append(section, t2);
    			append(section, input);
    			set_input_value(input, /*formData*/ ctx[0].steps[/*index*/ ctx[17]].id);
    			append(section, t3);
    			mount_component(formgroup0, section, null);
    			append(section, t4);
    			mount_component(formgroup1, section, null);
    			append(section, t5);
    			if (if_block) if_block.m(section, null);
    			append(section, t6);
    			current = true;

    			if (!mounted) {
    				dispose = listen(input, "input", input_input_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*formData*/ 1) {
    				set_input_value(input, /*formData*/ ctx[0].steps[/*index*/ ctx[17]].id);
    			}

    			const formgroup0_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup0_changes.$$scope = { dirty, ctx };
    			}

    			formgroup0.$set(formgroup0_changes);
    			const formgroup1_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup1_changes.$$scope = { dirty, ctx };
    			}

    			formgroup1.$set(formgroup1_changes);

    			if (/*formData*/ ctx[0].steps.length > 1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*formData*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(section, t6);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(formgroup0.$$.fragment, local);
    			transition_in(formgroup1.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(formgroup0.$$.fragment, local);
    			transition_out(formgroup1.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_component(formgroup0);
    			destroy_component(formgroup1);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (57:0) <Form>
    function create_default_slot(ctx) {
    	let formgroup0;
    	let t0;
    	let formgroup1;
    	let t1;
    	let formgroup2;
    	let t2;
    	let formgroup3;
    	let t3;
    	let formgroup4;
    	let t4;
    	let formgroup5;
    	let t5;
    	let div;
    	let button;
    	let t6;
    	let each_1_anchor;
    	let current;

    	formgroup0 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_21] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup1 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_19] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup2 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_17] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup3 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_15] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup4 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_13] },
    				$$scope: { ctx }
    			}
    		});

    	formgroup5 = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_10] },
    				$$scope: { ctx }
    			}
    		});

    	button = new Button({
    			props: {
    				type: "button",
    				color: "primary",
    				$$slots: { default: [create_default_slot_9] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*addStep*/ ctx[1]);
    	let each_value = /*formData*/ ctx[0].steps;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			create_component(formgroup0.$$.fragment);
    			t0 = space();
    			create_component(formgroup1.$$.fragment);
    			t1 = space();
    			create_component(formgroup2.$$.fragment);
    			t2 = space();
    			create_component(formgroup3.$$.fragment);
    			t3 = space();
    			create_component(formgroup4.$$.fragment);
    			t4 = space();
    			create_component(formgroup5.$$.fragment);
    			t5 = space();
    			div = element("div");
    			create_component(button.$$.fragment);
    			t6 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    			attr(div, "class", "add-step-container svelte-19ukitc");
    		},
    		m(target, anchor) {
    			mount_component(formgroup0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(formgroup1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(formgroup2, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(formgroup3, target, anchor);
    			insert(target, t3, anchor);
    			mount_component(formgroup4, target, anchor);
    			insert(target, t4, anchor);
    			mount_component(formgroup5, target, anchor);
    			insert(target, t5, anchor);
    			insert(target, div, anchor);
    			mount_component(button, div, null);
    			insert(target, t6, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const formgroup0_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup0_changes.$$scope = { dirty, ctx };
    			}

    			formgroup0.$set(formgroup0_changes);
    			const formgroup1_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup1_changes.$$scope = { dirty, ctx };
    			}

    			formgroup1.$set(formgroup1_changes);
    			const formgroup2_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup2_changes.$$scope = { dirty, ctx };
    			}

    			formgroup2.$set(formgroup2_changes);
    			const formgroup3_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup3_changes.$$scope = { dirty, ctx };
    			}

    			formgroup3.$set(formgroup3_changes);
    			const formgroup4_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup4_changes.$$scope = { dirty, ctx };
    			}

    			formgroup4.$set(formgroup4_changes);
    			const formgroup5_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				formgroup5_changes.$$scope = { dirty, ctx };
    			}

    			formgroup5.$set(formgroup5_changes);
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 262144) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);

    			if (dirty & /*reorderArray, formData, deleteStep*/ 13) {
    				each_value = /*formData*/ ctx[0].steps;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(formgroup0.$$.fragment, local);
    			transition_in(formgroup1.$$.fragment, local);
    			transition_in(formgroup2.$$.fragment, local);
    			transition_in(formgroup3.$$.fragment, local);
    			transition_in(formgroup4.$$.fragment, local);
    			transition_in(formgroup5.$$.fragment, local);
    			transition_in(button.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			transition_out(formgroup0.$$.fragment, local);
    			transition_out(formgroup1.$$.fragment, local);
    			transition_out(formgroup2.$$.fragment, local);
    			transition_out(formgroup3.$$.fragment, local);
    			transition_out(formgroup4.$$.fragment, local);
    			transition_out(formgroup5.$$.fragment, local);
    			transition_out(button.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			destroy_component(formgroup0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(formgroup1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(formgroup2, detaching);
    			if (detaching) detach(t2);
    			destroy_component(formgroup3, detaching);
    			if (detaching) detach(t3);
    			destroy_component(formgroup4, detaching);
    			if (detaching) detach(t4);
    			destroy_component(formgroup5, detaching);
    			if (detaching) detach(t5);
    			if (detaching) detach(div);
    			destroy_component(button);
    			if (detaching) detach(t6);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let form;
    	let t0;
    	let pre;
    	let t1_value = JSON.stringify(/*formData*/ ctx[0], null, 2) + "";
    	let t1;
    	let current;

    	form = new Form({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(form.$$.fragment);
    			t0 = space();
    			pre = element("pre");
    			t1 = text(t1_value);
    		},
    		m(target, anchor) {
    			mount_component(form, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, pre, anchor);
    			append(pre, t1);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const form_changes = {};

    			if (dirty & /*$$scope, formData*/ 262145) {
    				form_changes.$$scope = { dirty, ctx };
    			}

    			form.$set(form_changes);
    			if ((!current || dirty & /*formData*/ 1) && t1_value !== (t1_value = JSON.stringify(/*formData*/ ctx[0], null, 2) + "")) set_data(t1, t1_value);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(form.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(form.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(form, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(pre);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	

    	let { formData = {
    		title: "",
    		id: v4(),
    		version: 1,
    		contentType: "png",
    		folderName: "",
    		authorFolderName: "",
    		author: "",
    		email: "",
    		steps: []
    	} } = $$props;

    	addStep();

    	function addStep() {
    		$$invalidate(
    			0,
    			formData.steps = [
    				...formData.steps,
    				{
    					title: "",
    					contentType: "png",
    					id: v4()
    				}
    			],
    			formData
    		);

    		$$invalidate(0, formData.steps = [...formData.steps], formData);
    	}

    	function deleteStep(e) {
    		const stepId = e.target.getAttribute("data-id");
    		console.log(stepId);
    		$$invalidate(0, formData.steps = [...formData.steps.filter(s => s.id !== stepId)], formData);
    		console.log(formData.steps, "deleted the steps");
    	}

    	const reorderArray = (oldIndex, newIndex) => {
    		const movedItem = formData.steps.find((item, index) => index === oldIndex);
    		const remainingItems = formData.steps.filter((item, index) => index !== oldIndex);

    		$$invalidate(
    			0,
    			formData.steps = [
    				...remainingItems.slice(0, newIndex),
    				movedItem,
    				...remainingItems.slice(newIndex)
    			],
    			formData
    		);
    	};

    	function input_value_binding(value) {
    		formData.title = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_1(value) {
    		formData.author = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_2(value) {
    		formData.email = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_3(value) {
    		formData.authorFolderName = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_4(value) {
    		formData.folderName = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_5(value) {
    		formData.contentType = value;
    		$$invalidate(0, formData);
    	}

    	function input_input_handler(index) {
    		formData.steps[index].id = this.value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_6(value, index) {
    		formData.steps[index].title = value;
    		$$invalidate(0, formData);
    	}

    	function input_value_binding_7(value, index) {
    		formData.steps[index].contentType = value;
    		$$invalidate(0, formData);
    	}

    	const click_handler = index => reorderArray(index, index - 1);
    	const click_handler_1 = index => reorderArray(index, index + 1);

    	$$self.$$set = $$props => {
    		if ("formData" in $$props) $$invalidate(0, formData = $$props.formData);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*formData*/ 1) {
    			 lessonStore$1.set(formData);
    		}
    	};

    	return [
    		formData,
    		addStep,
    		deleteStep,
    		reorderArray,
    		input_value_binding,
    		input_value_binding_1,
    		input_value_binding_2,
    		input_value_binding_3,
    		input_value_binding_4,
    		input_value_binding_5,
    		input_input_handler,
    		input_value_binding_6,
    		input_value_binding_7,
    		click_handler,
    		click_handler_1
    	];
    }

    class Form_1 extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { formData: 0 });
    	}
    }

    /* src/Lessons/Lesson-Preview.svelte generated by Svelte v3.24.1 */

    function create_fragment$9(ctx) {
    	let article;
    	let img;
    	let img_src_value;
    	let img_alt_value;
    	let t0;
    	let h2;
    	let t1_value = /*$lessonStore*/ ctx[1]?.title + "";
    	let t1;

    	return {
    		c() {
    			article = element("article");
    			img = element("img");
    			t0 = space();
    			h2 = element("h2");
    			t1 = text(t1_value);
    			if (img.src !== (img_src_value = /*lessonMainImage*/ ctx[0])) attr(img, "src", img_src_value);
    			attr(img, "alt", img_alt_value = /*$lessonStore*/ ctx[1]?.title);
    			attr(img, "class", "svelte-1r72e6f");
    			attr(h2, "class", "svelte-1r72e6f");
    			attr(article, "data-lesson", /*lessonGetKey*/ ctx[2]);
    			attr(article, "class", "svelte-1r72e6f");
    		},
    		m(target, anchor) {
    			insert(target, article, anchor);
    			append(article, img);
    			append(article, t0);
    			append(article, h2);
    			append(h2, t1);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*lessonMainImage*/ 1 && img.src !== (img_src_value = /*lessonMainImage*/ ctx[0])) {
    				attr(img, "src", img_src_value);
    			}

    			if (dirty & /*$lessonStore*/ 2 && img_alt_value !== (img_alt_value = /*$lessonStore*/ ctx[1]?.title)) {
    				attr(img, "alt", img_alt_value);
    			}

    			if (dirty & /*$lessonStore*/ 2 && t1_value !== (t1_value = /*$lessonStore*/ ctx[1]?.title + "")) set_data(t1, t1_value);

    			if (dirty & /*lessonGetKey*/ 4) {
    				attr(article, "data-lesson", /*lessonGetKey*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(article);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let $lessonStore;
    	component_subscribe($$self, lessonStore$1, $$value => $$invalidate(1, $lessonStore = $$value));
    	
    	let lessonMainImage;
    	let lessonGetKey;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$lessonStore*/ 2) {
    			 $$invalidate(0, lessonMainImage = $lessonStore
    			? `http://localhost:3000/lessons/${$lessonStore.authorFolderName}/${$lessonStore.folderName}/main.${$lessonStore.contentType}`
    			: "");
    		}

    		if ($$self.$$.dirty & /*$lessonStore*/ 2) {
    			 $$invalidate(2, lessonGetKey = $lessonStore
    			? `${$lessonStore.title.replace(" ", "-")}`
    			: "");
    		}
    	};

    	return [lessonMainImage, $lessonStore, lessonGetKey];
    }

    class Lesson_Preview extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});
    	}
    }

    /* src/Lessons/Lesson.svelte generated by Svelte v3.24.1 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[21] = list[i];
    	child_ctx[23] = i;
    	return child_ctx;
    }

    // (148:4) {#if lesson.steps.length > 1}
    function create_if_block_3$2(ctx) {
    	let each_1_anchor;
    	let each_value = /*lesson*/ ctx[3].steps;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*stepIndex, lesson*/ 12) {
    				each_value = /*lesson*/ ctx[3].steps;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (149:6) {#each lesson.steps as step, index}
    function create_each_block$1(ctx) {
    	let span;
    	let span_data_step_value;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "data-step", span_data_step_value = /*index*/ ctx[23]);
    			attr(span, "class", "svelte-1wq543v");
    			toggle_class(span, "active", /*stepIndex*/ ctx[2] == /*index*/ ctx[23]);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*stepIndex*/ 4) {
    				toggle_class(span, "active", /*stepIndex*/ ctx[2] == /*index*/ ctx[23]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (156:2) {#if isVideo}
    function create_if_block_2$3(ctx) {
    	let video;
    	let track;
    	let source;
    	let source_src_value;

    	return {
    		c() {
    			video = element("video");
    			track = element("track");
    			source = element("source");
    			attr(track, "kind", "captions");
    			if (source.src !== (source_src_value = /*url*/ ctx[8])) attr(source, "src", source_src_value);
    			attr(video, "class", "svelte-1wq543v");
    		},
    		m(target, anchor) {
    			insert(target, video, anchor);
    			append(video, track);
    			append(video, source);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*url*/ 256 && source.src !== (source_src_value = /*url*/ ctx[8])) {
    				attr(source, "src", source_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(video);
    		}
    	};
    }

    // (163:2) {#if isImage}
    function create_if_block_1$3(ctx) {
    	let img;
    	let img_src_value;
    	let img_alt_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*url*/ ctx[8])) attr(img, "src", img_src_value);
    			attr(img, "alt", img_alt_value = "step " + (/*stepIndex*/ ctx[2] + 1));
    			attr(img, "id", "main-image");
    			attr(img, "class", "svelte-1wq543v");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*url*/ 256 && img.src !== (img_src_value = /*url*/ ctx[8])) {
    				attr(img, "src", img_src_value);
    			}

    			if (dirty & /*stepIndex*/ 4 && img_alt_value !== (img_alt_value = "step " + (/*stepIndex*/ ctx[2] + 1))) {
    				attr(img, "alt", img_alt_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (166:2) {#if lesson.steps.length > 1}
    function create_if_block$4(ctx) {
    	let section;
    	let button0;
    	let i0;
    	let button0_disabled_value;
    	let t;
    	let button1;
    	let i1;
    	let button1_disabled_value;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			section = element("section");
    			button0 = element("button");
    			i0 = element("i");
    			t = space();
    			button1 = element("button");
    			i1 = element("i");
    			attr(i0, "class", "fa fa-arrow-left svelte-1wq543v");
    			attr(i0, "aria-hidden", "true");
    			button0.disabled = button0_disabled_value = /*stepIndex*/ ctx[2] === 0;
    			attr(button0, "id", "back");
    			attr(button0, "class", "svelte-1wq543v");
    			attr(i1, "class", "fa fa-arrow-right svelte-1wq543v");
    			attr(i1, "aria-hidden", "true");
    			button1.disabled = button1_disabled_value = /*stepIndex*/ ctx[2] === /*lesson*/ ctx[3].steps.length - 1;
    			attr(button1, "id", "forward");
    			attr(button1, "class", "svelte-1wq543v");
    			attr(section, "id", "controls");
    			attr(section, "class", "svelte-1wq543v");
    		},
    		m(target, anchor) {
    			insert(target, section, anchor);
    			append(section, button0);
    			append(button0, i0);
    			append(section, t);
    			append(section, button1);
    			append(button1, i1);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*moveBack*/ ctx[9]),
    					listen(button1, "click", /*moveForward*/ ctx[10])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*stepIndex*/ 4 && button0_disabled_value !== (button0_disabled_value = /*stepIndex*/ ctx[2] === 0)) {
    				button0.disabled = button0_disabled_value;
    			}

    			if (dirty & /*stepIndex, lesson*/ 12 && button1_disabled_value !== (button1_disabled_value = /*stepIndex*/ ctx[2] === /*lesson*/ ctx[3].steps.length - 1)) {
    				button1.disabled = button1_disabled_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let section1;
    	let p;
    	let t1;
    	let section0;
    	let t2;
    	let h3;
    	let t3_value = /*currentStep*/ ctx[5].title + "";
    	let t3;
    	let t4;
    	let t5;
    	let t6;
    	let t7;
    	let mounted;
    	let dispose;
    	let if_block0 = /*lesson*/ ctx[3].steps.length > 1 && create_if_block_3$2(ctx);
    	let if_block1 = /*isVideo*/ ctx[6] && create_if_block_2$3(ctx);
    	let if_block2 = /*isImage*/ ctx[7] && create_if_block_1$3(ctx);
    	let if_block3 = /*lesson*/ ctx[3].steps.length > 1 && create_if_block$4(ctx);

    	return {
    		c() {
    			section1 = element("section");
    			p = element("p");
    			p.textContent = "close";
    			t1 = space();
    			section0 = element("section");
    			if (if_block0) if_block0.c();
    			t2 = space();
    			h3 = element("h3");
    			t3 = text(t3_value);
    			t4 = space();
    			if (if_block1) if_block1.c();
    			t5 = space();
    			if (if_block2) if_block2.c();
    			t6 = space();
    			if (if_block3) if_block3.c();
    			t7 = space();
    			attr(p, "id", "close");
    			attr(p, "class", "svelte-1wq543v");
    			attr(section0, "id", "header");
    			attr(section0, "class", "svelte-1wq543v");
    			attr(h3, "id", "text");
    			attr(h3, "class", "svelte-1wq543v");
    			set_style(section1, "left", /*left*/ ctx[1] + "px");
    			set_style(section1, "top", /*top*/ ctx[0] + "px");
    			attr(section1, "id", "lesson");
    			attr(section1, "class", "svelte-1wq543v");
    		},
    		m(target, anchor) {
    			insert(target, section1, anchor);
    			append(section1, p);
    			/*p_binding*/ ctx[15](p);
    			append(section1, t1);
    			append(section1, section0);
    			if (if_block0) if_block0.m(section0, null);
    			append(section1, t2);
    			append(section1, h3);
    			append(h3, t3);
    			append(section1, t4);
    			if (if_block1) if_block1.m(section1, null);
    			append(section1, t5);
    			if (if_block2) if_block2.m(section1, null);
    			append(section1, t6);
    			if (if_block3) if_block3.m(section1, null);
    			insert(target, t7, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(p, "click", /*close*/ ctx[11]),
    					listen(section0, "mousedown", /*startMove*/ ctx[12]),
    					listen(document.body, "mousemove", /*move*/ ctx[13]),
    					listen(document.body, "mouseup", /*stopMove*/ ctx[14])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*lesson*/ ctx[3].steps.length > 1) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3$2(ctx);
    					if_block0.c();
    					if_block0.m(section0, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*currentStep*/ 32 && t3_value !== (t3_value = /*currentStep*/ ctx[5].title + "")) set_data(t3, t3_value);

    			if (/*isVideo*/ ctx[6]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$3(ctx);
    					if_block1.c();
    					if_block1.m(section1, t5);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*isImage*/ ctx[7]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1$3(ctx);
    					if_block2.c();
    					if_block2.m(section1, t6);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (/*lesson*/ ctx[3].steps.length > 1) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block$4(ctx);
    					if_block3.c();
    					if_block3.m(section1, null);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (dirty & /*left*/ 2) {
    				set_style(section1, "left", /*left*/ ctx[1] + "px");
    			}

    			if (dirty & /*top*/ 1) {
    				set_style(section1, "top", /*top*/ ctx[0] + "px");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(section1);
    			/*p_binding*/ ctx[15](null);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (detaching) detach(t7);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { top = 300 } = $$props;
    	let { left = 300 } = $$props;
    	const dispatcher = createEventDispatcher();
    	let stepIndex = 0;
    	let lesson = undefined;
    	let closeP;

    	lessonStore$1.subscribe(newLesson => {
    		$$invalidate(3, lesson = newLesson);
    	});

    	function moveBack() {
    		if (stepIndex > 0) {
    			$$invalidate(2, stepIndex -= 1);
    		}
    	}

    	function moveForward() {
    		if (stepIndex <= lesson.steps.length - 2) {
    			$$invalidate(2, stepIndex += 1);
    		}
    	}

    	function close() {
    		dispatcher("close");
    	}

    	let moving = false;
    	let offsetX = 0;
    	let offsetY = 0;
    	let layerY;

    	function startMove(e) {
    		moving = true;
    		({ offsetY, offsetX, layerY } = e);
    	}

    	function move(e) {
    		if (moving) {
    			console.log(closeP.clientHeight);
    			$$invalidate(0, top = e.clientY - closeP.clientHeight - offsetY);
    			$$invalidate(1, left = e.clientX - offsetX);
    		}
    	}

    	function stopMove() {
    		moving = false;
    		console.log("stop");
    	}

    	function p_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			closeP = $$value;
    			$$invalidate(4, closeP);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("top" in $$props) $$invalidate(0, top = $$props.top);
    		if ("left" in $$props) $$invalidate(1, left = $$props.left);
    	};

    	let currentStep;
    	let isVideo;
    	let isImage;
    	let url;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*lesson, stepIndex*/ 12) {
    			 $$invalidate(2, stepIndex = lesson && lesson.steps.length <= stepIndex && stepIndex > 0
    			? lesson.steps.length - 1
    			: stepIndex);
    		}

    		if ($$self.$$.dirty & /*lesson, stepIndex*/ 12) {
    			 $$invalidate(5, currentStep = lesson && lesson.steps[stepIndex]);
    		}

    		if ($$self.$$.dirty & /*currentStep*/ 32) {
    			 $$invalidate(6, isVideo = currentStep && ["mp4", "ogg"].includes(currentStep.contentType));
    		}

    		if ($$self.$$.dirty & /*currentStep*/ 32) {
    			 $$invalidate(7, isImage = currentStep && ["png", "gif", "jpg"].includes(currentStep.contentType));
    		}

    		if ($$self.$$.dirty & /*currentStep, lesson, stepIndex*/ 44) {
    			 $$invalidate(8, url = currentStep && lesson
    			? `http://localhost:3000/lessons/${lesson.authorFolderName}/${lesson.folderName}/step-${stepIndex + 1}.${currentStep.contentType}`
    			: "");
    		}
    	};

    	return [
    		top,
    		left,
    		stepIndex,
    		lesson,
    		closeP,
    		currentStep,
    		isVideo,
    		isImage,
    		url,
    		moveBack,
    		moveForward,
    		close,
    		startMove,
    		move,
    		stopMove,
    		p_binding
    	];
    }

    class Lesson extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { top: 0, left: 1 });
    	}
    }

    /* src/Preview.svelte generated by Svelte v3.24.1 */

    function create_default_slot_1$1(ctx) {
    	let option0;
    	let t1;
    	let option1;

    	return {
    		c() {
    			option0 = element("option");
    			option0.textContent = "Lesson";
    			t1 = space();
    			option1 = element("option");
    			option1.textContent = "Lesson Selector";
    			option0.__value = "Lesson";
    			option0.value = option0.__value;
    			option1.__value = "Lesson Selector";
    			option1.value = option1.__value;
    		},
    		m(target, anchor) {
    			insert(target, option0, anchor);
    			insert(target, t1, anchor);
    			insert(target, option1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(option0);
    			if (detaching) detach(t1);
    			if (detaching) detach(option1);
    		}
    	};
    }

    // (22:0) <FormGroup>
    function create_default_slot$1(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_value;
    	let current;
    	label = new Label({ props: { for: "contentType" } });

    	function input_value_binding(value) {
    		/*input_value_binding*/ ctx[1].call(null, value);
    	}

    	let input_props = {
    		readonly: false,
    		size: "1",
    		type: "select",
    		id: "contentType",
    		$$slots: { default: [create_default_slot_1$1] },
    		$$scope: { ctx }
    	};

    	if (/*preview*/ ctx[0] !== void 0) {
    		input_props.value = /*preview*/ ctx[0];
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "value", input_value_binding));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const input_changes = {};

    			if (dirty & /*$$scope*/ 4) {
    				input_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_value && dirty & /*preview*/ 1) {
    				updating_value = true;
    				input_changes.value = /*preview*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (34:0) {#if preview == 'Lesson Selector'}
    function create_if_block_1$4(ctx) {
    	let div;
    	let h2;
    	let t1;
    	let lessonpreview;
    	let current;
    	lessonpreview = new Lesson_Preview({});

    	return {
    		c() {
    			div = element("div");
    			h2 = element("h2");
    			h2.textContent = "Lesson Selector Preview";
    			t1 = space();
    			create_component(lessonpreview.$$.fragment);
    			attr(h2, "class", "svelte-1xmz85d");
    			attr(div, "id", "lesson-selector-preview");
    			attr(div, "class", "svelte-1xmz85d");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h2);
    			append(div, t1);
    			mount_component(lessonpreview, div, null);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(lessonpreview.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(lessonpreview.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(lessonpreview);
    		}
    	};
    }

    // (40:0) {#if preview == 'Lesson'}
    function create_if_block$5(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<h2 class="svelte-1xmz85d">Lesson Preview</h2>`;
    			attr(div, "id", "lesson-preview");
    			attr(div, "class", "svelte-1xmz85d");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let formgroup;
    	let t0;
    	let t1;
    	let if_block1_anchor;
    	let current;

    	formgroup = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	let if_block0 = /*preview*/ ctx[0] == "Lesson Selector" && create_if_block_1$4();
    	let if_block1 = /*preview*/ ctx[0] == "Lesson" && create_if_block$5();

    	return {
    		c() {
    			create_component(formgroup.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(formgroup, target, anchor);
    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const formgroup_changes = {};

    			if (dirty & /*$$scope, preview*/ 5) {
    				formgroup_changes.$$scope = { dirty, ctx };
    			}

    			formgroup.$set(formgroup_changes);

    			if (/*preview*/ ctx[0] == "Lesson Selector") {
    				if (if_block0) {
    					if (dirty & /*preview*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_1$4();
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*preview*/ ctx[0] == "Lesson") {
    				if (if_block1) ; else {
    					if_block1 = create_if_block$5();
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(formgroup.$$.fragment, local);
    			transition_in(if_block0);
    			current = true;
    		},
    		o(local) {
    			transition_out(formgroup.$$.fragment, local);
    			transition_out(if_block0);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(formgroup, detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { preview = "Lesson" } = $$props;

    	function input_value_binding(value) {
    		preview = value;
    		$$invalidate(0, preview);
    	}

    	$$self.$$set = $$props => {
    		if ("preview" in $$props) $$invalidate(0, preview = $$props.preview);
    	};

    	return [preview, input_value_binding];
    }

    class Preview extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { preview: 0 });
    	}
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    	  path: basedir,
    	  exports: {},
    	  require: function (path, base) {
          return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
        }
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var FileSaver_min = createCommonjsModule(function (module, exports) {
    (function(a,b){b();})(commonjsGlobal,function(){function b(a,b){return "undefined"==typeof b?b={autoBom:!1}:"object"!=typeof b&&(console.warn("Deprecated: Expected third argument to be a object"),b={autoBom:!b}),b.autoBom&&/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(a.type)?new Blob(["\uFEFF",a],{type:a.type}):a}function c(b,c,d){var e=new XMLHttpRequest;e.open("GET",b),e.responseType="blob",e.onload=function(){a(e.response,c,d);},e.onerror=function(){console.error("could not download file");},e.send();}function d(a){var b=new XMLHttpRequest;b.open("HEAD",a,!1);try{b.send();}catch(a){}return 200<=b.status&&299>=b.status}function e(a){try{a.dispatchEvent(new MouseEvent("click"));}catch(c){var b=document.createEvent("MouseEvents");b.initMouseEvent("click",!0,!0,window,0,0,0,80,20,!1,!1,!1,!1,0,null),a.dispatchEvent(b);}}var f="object"==typeof window&&window.window===window?window:"object"==typeof self&&self.self===self?self:"object"==typeof commonjsGlobal&&commonjsGlobal.global===commonjsGlobal?commonjsGlobal:void 0,a=f.saveAs||("object"!=typeof window||window!==f?function(){}:"download"in HTMLAnchorElement.prototype?function(b,g,h){var i=f.URL||f.webkitURL,j=document.createElement("a");g=g||b.name||"download",j.download=g,j.rel="noopener","string"==typeof b?(j.href=b,j.origin===location.origin?e(j):d(j.href)?c(b,g,h):e(j,j.target="_blank")):(j.href=i.createObjectURL(b),setTimeout(function(){i.revokeObjectURL(j.href);},4E4),setTimeout(function(){e(j);},0));}:"msSaveOrOpenBlob"in navigator?function(f,g,h){if(g=g||f.name||"download","string"!=typeof f)navigator.msSaveOrOpenBlob(b(f,h),g);else if(d(f))c(f,g,h);else {var i=document.createElement("a");i.href=f,i.target="_blank",setTimeout(function(){e(i);});}}:function(a,b,d,e){if(e=e||open("","_blank"),e&&(e.document.title=e.document.body.innerText="downloading..."),"string"==typeof a)return c(a,b,d);var g="application/octet-stream"===a.type,h=/constructor/i.test(f.HTMLElement)||f.safari,i=/CriOS\/[\d]+/.test(navigator.userAgent);if((i||g&&h)&&"object"==typeof FileReader){var j=new FileReader;j.onloadend=function(){var a=j.result;a=i?a:a.replace(/^data:[^;]*;/,"data:attachment/file;"),e?e.location.href=a:location=a,e=null;},j.readAsDataURL(a);}else {var k=f.URL||f.webkitURL,l=k.createObjectURL(a);e?e.location=l:location.href=l,e=null,setTimeout(function(){k.revokeObjectURL(l);},4E4);}});f.saveAs=a.saveAs=a,(module.exports=a);});


    });

    /* src/App.svelte generated by Svelte v3.24.1 */

    function create_default_slot_13$1(ctx) {
    	let h1;

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Lesson Builder";
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    		}
    	};
    }

    // (48:2) <Row>
    function create_default_slot_12$1(ctx) {
    	let col;
    	let current;

    	col = new Col({
    			props: {
    				$$slots: { default: [create_default_slot_13$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(col.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(col, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const col_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				col_changes.$$scope = { dirty, ctx };
    			}

    			col.$set(col_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(col.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(col.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(col, detaching);
    		}
    	};
    }

    // (56:8) <Label for="lessonFile">
    function create_default_slot_11$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Lesson File");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (55:6) <FormGroup>
    function create_default_slot_10$1(ctx) {
    	let label;
    	let t;
    	let input;
    	let updating_files;
    	let current;

    	label = new Label({
    			props: {
    				for: "lessonFile",
    				$$slots: { default: [create_default_slot_11$1] },
    				$$scope: { ctx }
    			}
    		});

    	function input_files_binding(value) {
    		/*input_files_binding*/ ctx[6].call(null, value);
    	}

    	let input_props = {
    		size: "0",
    		readonly: false,
    		type: "file",
    		name: "file",
    		accept: "application/json",
    		id: "lessonFile"
    	};

    	if (/*fileList*/ ctx[2] !== void 0) {
    		input_props.files = /*fileList*/ ctx[2];
    	}

    	input = new Input({ props: input_props });
    	binding_callbacks.push(() => bind(input, "files", input_files_binding));

    	return {
    		c() {
    			create_component(label.$$.fragment);
    			t = space();
    			create_component(input.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(label, target, anchor);
    			insert(target, t, anchor);
    			mount_component(input, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const label_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				label_changes.$$scope = { dirty, ctx };
    			}

    			label.$set(label_changes);
    			const input_changes = {};

    			if (!updating_files && dirty & /*fileList*/ 4) {
    				updating_files = true;
    				input_changes.files = /*fileList*/ ctx[2];
    				add_flush_callback(() => updating_files = false);
    			}

    			input.$set(input_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(label.$$.fragment, local);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(label.$$.fragment, local);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(label, detaching);
    			if (detaching) detach(t);
    			destroy_component(input, detaching);
    		}
    	};
    }

    // (54:4) <Col md="3">
    function create_default_slot_9$1(ctx) {
    	let formgroup;
    	let current;

    	formgroup = new FormGroup({
    			props: {
    				$$slots: { default: [create_default_slot_10$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(formgroup.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(formgroup, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const formgroup_changes = {};

    			if (dirty & /*$$scope, fileList*/ 1028) {
    				formgroup_changes.$$scope = { dirty, ctx };
    			}

    			formgroup.$set(formgroup_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(formgroup.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(formgroup.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(formgroup, detaching);
    		}
    	};
    }

    // (68:6) <Button on:click={upload} class="control-btns" color="primary">
    function create_default_slot_8$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Load");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (67:4) <Col md="2">
    function create_default_slot_7$1(ctx) {
    	let button;
    	let current;

    	button = new Button({
    			props: {
    				class: "control-btns",
    				color: "primary",
    				$$slots: { default: [create_default_slot_8$1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*upload*/ ctx[5]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (73:6) <Button class="control-btns" on:click={download} color="success">
    function create_default_slot_6$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("Download");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (72:4) <Col md="2">
    function create_default_slot_5$1(ctx) {
    	let button;
    	let current;

    	button = new Button({
    			props: {
    				class: "control-btns",
    				color: "success",
    				$$slots: { default: [create_default_slot_6$1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*download*/ ctx[4]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (53:2) <Row>
    function create_default_slot_4$1(ctx) {
    	let col0;
    	let t0;
    	let col1;
    	let t1;
    	let col2;
    	let current;

    	col0 = new Col({
    			props: {
    				md: "3",
    				$$slots: { default: [create_default_slot_9$1] },
    				$$scope: { ctx }
    			}
    		});

    	col1 = new Col({
    			props: {
    				md: "2",
    				$$slots: { default: [create_default_slot_7$1] },
    				$$scope: { ctx }
    			}
    		});

    	col2 = new Col({
    			props: {
    				md: "2",
    				$$slots: { default: [create_default_slot_5$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(col0.$$.fragment);
    			t0 = space();
    			create_component(col1.$$.fragment);
    			t1 = space();
    			create_component(col2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(col0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(col1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(col2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const col0_changes = {};

    			if (dirty & /*$$scope, fileList*/ 1028) {
    				col0_changes.$$scope = { dirty, ctx };
    			}

    			col0.$set(col0_changes);
    			const col1_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				col1_changes.$$scope = { dirty, ctx };
    			}

    			col1.$set(col1_changes);
    			const col2_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				col2_changes.$$scope = { dirty, ctx };
    			}

    			col2.$set(col2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(col0.$$.fragment, local);
    			transition_in(col1.$$.fragment, local);
    			transition_in(col2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(col0.$$.fragment, local);
    			transition_out(col1.$$.fragment, local);
    			transition_out(col2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(col0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(col1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(col2, detaching);
    		}
    	};
    }

    // (79:4) <Col md="6">
    function create_default_slot_3$1(ctx) {
    	let form;
    	let updating_formData;
    	let current;

    	function form_formData_binding(value) {
    		/*form_formData_binding*/ ctx[7].call(null, value);
    	}

    	let form_props = {};

    	if (/*formData*/ ctx[3] !== void 0) {
    		form_props.formData = /*formData*/ ctx[3];
    	}

    	form = new Form_1({ props: form_props });
    	binding_callbacks.push(() => bind(form, "formData", form_formData_binding));

    	return {
    		c() {
    			create_component(form.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(form, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const form_changes = {};

    			if (!updating_formData && dirty & /*formData*/ 8) {
    				updating_formData = true;
    				form_changes.formData = /*formData*/ ctx[3];
    				add_flush_callback(() => updating_formData = false);
    			}

    			form.$set(form_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(form.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(form.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(form, detaching);
    		}
    	};
    }

    // (82:4) <Col md="6">
    function create_default_slot_2$1(ctx) {
    	let preview;
    	let updating_preview;
    	let current;

    	function preview_preview_binding(value) {
    		/*preview_preview_binding*/ ctx[8].call(null, value);
    	}

    	let preview_props = {};

    	if (/*lessonType*/ ctx[0] !== void 0) {
    		preview_props.preview = /*lessonType*/ ctx[0];
    	}

    	preview = new Preview({ props: preview_props });
    	binding_callbacks.push(() => bind(preview, "preview", preview_preview_binding));

    	return {
    		c() {
    			create_component(preview.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(preview, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const preview_changes = {};

    			if (!updating_preview && dirty & /*lessonType*/ 1) {
    				updating_preview = true;
    				preview_changes.preview = /*lessonType*/ ctx[0];
    				add_flush_callback(() => updating_preview = false);
    			}

    			preview.$set(preview_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(preview.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(preview.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(preview, detaching);
    		}
    	};
    }

    // (78:2) <Row>
    function create_default_slot_1$2(ctx) {
    	let col0;
    	let t;
    	let col1;
    	let current;

    	col0 = new Col({
    			props: {
    				md: "6",
    				$$slots: { default: [create_default_slot_3$1] },
    				$$scope: { ctx }
    			}
    		});

    	col1 = new Col({
    			props: {
    				md: "6",
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(col0.$$.fragment);
    			t = space();
    			create_component(col1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(col0, target, anchor);
    			insert(target, t, anchor);
    			mount_component(col1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const col0_changes = {};

    			if (dirty & /*$$scope, formData*/ 1032) {
    				col0_changes.$$scope = { dirty, ctx };
    			}

    			col0.$set(col0_changes);
    			const col1_changes = {};

    			if (dirty & /*$$scope, lessonType*/ 1025) {
    				col1_changes.$$scope = { dirty, ctx };
    			}

    			col1.$set(col1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(col0.$$.fragment, local);
    			transition_in(col1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(col0.$$.fragment, local);
    			transition_out(col1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(col0, detaching);
    			if (detaching) detach(t);
    			destroy_component(col1, detaching);
    		}
    	};
    }

    // (47:0) <Container>
    function create_default_slot$2(ctx) {
    	let row0;
    	let t0;
    	let row1;
    	let t1;
    	let row2;
    	let current;

    	row0 = new Row({
    			props: {
    				$$slots: { default: [create_default_slot_12$1] },
    				$$scope: { ctx }
    			}
    		});

    	row1 = new Row({
    			props: {
    				$$slots: { default: [create_default_slot_4$1] },
    				$$scope: { ctx }
    			}
    		});

    	row2 = new Row({
    			props: {
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(row0.$$.fragment);
    			t0 = space();
    			create_component(row1.$$.fragment);
    			t1 = space();
    			create_component(row2.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(row0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(row1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(row2, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const row0_changes = {};

    			if (dirty & /*$$scope*/ 1024) {
    				row0_changes.$$scope = { dirty, ctx };
    			}

    			row0.$set(row0_changes);
    			const row1_changes = {};

    			if (dirty & /*$$scope, fileList*/ 1028) {
    				row1_changes.$$scope = { dirty, ctx };
    			}

    			row1.$set(row1_changes);
    			const row2_changes = {};

    			if (dirty & /*$$scope, lessonType, formData*/ 1033) {
    				row2_changes.$$scope = { dirty, ctx };
    			}

    			row2.$set(row2_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(row0.$$.fragment, local);
    			transition_in(row1.$$.fragment, local);
    			transition_in(row2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(row0.$$.fragment, local);
    			transition_out(row1.$$.fragment, local);
    			transition_out(row2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(row0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(row1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(row2, detaching);
    		}
    	};
    }

    // (88:0) {#if lessonType == 'Lesson'}
    function create_if_block$6(ctx) {
    	let lesson;
    	let current;

    	lesson = new Lesson({
    			props: { top: 270, left: /*left*/ ctx[1] }
    		});

    	return {
    		c() {
    			create_component(lesson.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(lesson, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const lesson_changes = {};
    			if (dirty & /*left*/ 2) lesson_changes.left = /*left*/ ctx[1];
    			lesson.$set(lesson_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(lesson.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(lesson.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(lesson, detaching);
    		}
    	};
    }

    function create_fragment$c(ctx) {
    	let container;
    	let t;
    	let if_block_anchor;
    	let current;

    	container = new Container({
    			props: {
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			}
    		});

    	let if_block = /*lessonType*/ ctx[0] == "Lesson" && create_if_block$6(ctx);

    	return {
    		c() {
    			create_component(container.$$.fragment);
    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(container, target, anchor);
    			insert(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const container_changes = {};

    			if (dirty & /*$$scope, lessonType, formData, fileList*/ 1037) {
    				container_changes.$$scope = { dirty, ctx };
    			}

    			container.$set(container_changes);

    			if (/*lessonType*/ ctx[0] == "Lesson") {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*lessonType*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$6(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(container.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(container.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(container, detaching);
    			if (detaching) detach(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	
    	let lessonType = "Lesson";
    	let left;
    	let lessonObject;
    	let fileList;
    	let formData;
    	lessonStore$1.subscribe(l => lessonObject = l);

    	onMount(() => {
    		$$invalidate(1, left = document.body.clientWidth / 2 + 40);
    	});

    	function download() {
    		if (lessonObject.title !== "") {
    			const blob = new Blob([JSON.stringify(lessonObject)], { type: "application/json;charset=utf-8" });
    			FileSaver_min.saveAs(blob, lessonObject.title + ".json");
    		}
    	}

    	function upload() {
    		const file = fileList[0];

    		if (!file) {
    			return;
    		}

    		const fr = new FileReader();

    		fr.onload = function () {
    			const json = JSON.parse(fr.result.toString());
    			$$invalidate(3, formData = json);
    		};

    		fr.readAsText(file);
    	}

    	function input_files_binding(value) {
    		fileList = value;
    		$$invalidate(2, fileList);
    	}

    	function form_formData_binding(value) {
    		formData = value;
    		$$invalidate(3, formData);
    	}

    	function preview_preview_binding(value) {
    		lessonType = value;
    		$$invalidate(0, lessonType);
    	}

    	return [
    		lessonType,
    		left,
    		fileList,
    		formData,
    		download,
    		upload,
    		input_files_binding,
    		form_formData_binding,
    		preview_preview_binding
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
