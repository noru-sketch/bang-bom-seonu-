import re
def split_rules(css):
    out=[];i=0;n=len(css)
    while i<n:
        j=css.find('{',i)
        if j<0: break
        sel=css[i:j].strip(); depth=1;k=j+1
        while depth and k<n:
            if css[k]=='{': depth+=1
            elif css[k]=='}': depth-=1
            k+=1
        out.append((sel,css[j+1:k-1])); i=k
    return out
def prefix(css, pre):
    css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
    res=[]
    for sel,body in split_rules(css):
        if sel.startswith('@media'):
            res.append(sel+'{'+prefix(body,pre)+'}')
        elif sel.startswith('@font-face') or sel.startswith('@keyframes'):
            continue
        elif sel==':root':
            res.append(pre+'{'+body+'}')
        elif sel in ('html,body',):
            continue
        elif sel=='body':
            res.append(pre+'{'+body.replace('overflow:hidden','')+'}')
        else:
            parts=[]
            for s in sel.split(','):
                s=s.strip()
                if s=='*': parts.append(pre+' *')
                elif s.startswith('body.'): parts.append(s.replace('body.','body.',1).split(' ',1)[0]+' '+pre+' '+(s.split(' ',1)[1] if ' ' in s else ''))
                else: parts.append(pre+' '+s)
            res.append(','.join(parts)+'{'+body+'}')
    return '\n'.join(res)
